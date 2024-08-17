// const https = require('https');
require('dotenv').config()

const properties = require('properties-parser')

const github = require('@actions/github')
const core = require('@actions/core')

const OWNER = 'melkypie'
const REPO = 'resource-packs'

const RAW_GITHUB = `https://raw.githubusercontent.com/${OWNER}/${REPO}`
const BRANCH = `https://github.com/${OWNER}/${REPO}/tree/`

const PROPERTIES = 'pack.properties'
const ICON = 'icon.png'
const MAIN_BRANCH = 'github-actions'
const MANIFEST = 'manifest.js'

const octokit = github.getOctokit(process.env.ACCESS_TOKEN)

function parseProperties(data) {
	if (data.startsWith('displayName')) {
		return properties.parse(data)
	}
	return null
}

async function getPackProperties(branch) {
	let internalName = branch.name
	let commit = branch.commit.sha

	const response = await fetch(`${RAW_GITHUB}/${commit}/${PROPERTIES}`)
	if (!response.ok || response.status != 200) {
		if (response.status == 404) {
			console.log(internalName, commit, PROPERTIES, 'is missing')
			return Promise.resolve(null)
		}

		return Promise.reject(
			JSON.stringify({
				name: branch.name,
				commit: commit,
				statusText: response.statusText,
				file: PROPERTIES
			})
		)
	}

	const data = await response.text()
	const props = parseProperties(data)
	if (props != null) {
		props['internalName'] = internalName

		let tags = props['tags'].split(',')
		if (tags[0] !== '') {
			props['tags'] = tags
		} else {
			delete props['tags']
		}

		props['commit'] = commit
		props['repo'] = BRANCH + internalName

		const iconResponse = await fetch(`${RAW_GITHUB}/${commit}/${ICON}`)
		props.hasIcon = iconResponse.status == 200
	} else {
		console.log(internalName, commit, PROPERTIES, 'empty or invalid')
	}

	return Promise.resolve(props)
}

async function parsePackProperties(packs) {
	return Promise.all(
		packs.map(async (branch) => {
			return getPackProperties(branch)
		})
	)
}

async function generateManifest(properties) {
	let json = JSON.stringify(properties)
	let now = new Date()

	console.log(JSON.stringify(properties, null, 2))

	const result = await octokit.rest.repos.getContent({
		owner: OWNER,
		repo: REPO,
		path: MANIFEST,
		ref: MAIN_BRANCH
	})

	await octokit.rest.repos.createOrUpdateFileContents({
		owner: OWNER,
		repo: REPO,
		path: MANIFEST,
		branch: MAIN_BRANCH,
		message: `Update ${MANIFEST} ${now.toISOString()}`,
		content: Buffer.from(json).toString('base64'),
		sha: result.data.sha
	})
}

async function main() {
	try {
		const branches = await octokit.paginate(octokit.rest.repos.listBranches, {
			owner: OWNER,
			repo: REPO,
			per_page: 100
		})

		const packs = branches.filter((f) => f.name.startsWith('pack-'))
		const packProperties = await parsePackProperties(packs)
		const filteredProperties = packProperties.filter((p) => p !== null)
		await generateManifest(filteredProperties)

		return Promise.resolve(true)
	} catch (error) {
		core.setFailed(error)
	}
}

console.log('running node', process.version)

main()