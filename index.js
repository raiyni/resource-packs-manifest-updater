const github = require('octonode');
const https = require('https');
const properties = require('node-properties-parser');
const core = require('@actions/core');

try {
    REPO = "melkypie/resource-packs"
    RAW_GITHUB = "https://raw.githubusercontent.com/" + REPO;
    BRANCH = "https://github.com/" + REPO + "/tree/";
    PROPERTIES = "pack.properties";
    ICON = "icon.png";
    MAIN_BRANCH = "github-actions";
    MANIFEST = "manifest.js";
    TOKEN = process.env.ACCESS_TOKEN;

    const client = github.client(TOKEN);
    let combinedArray = [];

    const repo = client.repo(REPO);
    repo.branches(function (err, data, headers) {
        let combinedPromise = [];
        for (let branch of data) {
            if (branch.name.startsWith("pack-")) {
                let currentBranch = branch;
                combinedPromise.push(new Promise((resolve, reject) => {
                    getPackProperties(resolve, reject, currentBranch)
                }));
            }
        }

        Promise.all(combinedPromise).then(() => {
            checkIcons(combinedArray);
        });
    });


    function getPackProperties(resolve, reject, branch) {
        let internalName = branch.name;
        let commit = branch.commit.sha;
        https.get(RAW_GITHUB + "/" + commit + "/" + PROPERTIES, (resp) => {
            let data = '';
            resp.on('data', (chunk) => {
                data += chunk;
            });

            resp.on('end', () => {
                let props = checkProperties(data);
                if (props != null) {
                    props["internalName"] = internalName;
                    let tags = props["tags"].split(',');
                    if (tags[0] !== "") {
                        props["tags"] = tags;
                    } else {
                        delete props["tags"];
                    }
                    props["commit"] = commit;
                    props["repo"] = BRANCH + internalName;
                    combinedArray.push(props);
                }
                resolve(props);
            });
        }).on("error", (err) => {
            throw "Encountered an error: " + err.message;
        });
    }

    function checkProperties(data) {
        if (data.startsWith("displayName")) {
            return properties.parse(data);
        }
        return null;
    }

    function checkIcons(combinedProps) {
        let combinedPromise = [];
        let combinedFinalProps = [];
        for (let props of combinedProps) {
            combinedPromise.push(new Promise((resolve, reject) => {
                https.get(RAW_GITHUB + "/" + props["commit"] + "/" + ICON, (resp) => {
                    props["hasIcon"] = resp.statusCode === 200;
                    combinedFinalProps.push(props);
                    resolve();
                }).on("error", (err) => {
                    throw "Encountered an error: " + err.message;
                });
            }));
        }

        Promise.all(combinedPromise).then(() => {
            combineAndCommit(combinedFinalProps);
        })
    }

    function combineAndCommit(combined) {
        let json = JSON.stringify(combined);
        console.log(JSON.stringify(combined, null, 2));
        let dateNow = new Date();
        repo.contents(MANIFEST, MAIN_BRANCH, (err, data, headers) => {
            if (err == null) {
                repo.updateContents(MANIFEST, "Update " + MANIFEST + " " + dateNow.toISOString(), json, data.sha, MAIN_BRANCH, (err, data, headers) => {
                    if (err == null) {
                        console.log("Updated " + dateNow.toISOString());
                    } else {
                        throw "ERROR when updating contents: " + err;
                    }
                });
            } else {
                throw "Failed to find the file " + err;
            }
        });
    }
} catch (error) {
    core.setFailed(error.message);
}
