let execSync = require("child_process").execSync;
let githubUrl = require("parse-github-url");
let bluebird = require("bluebird");
let yaml = require("js-yaml-promise");
let fs = bluebird.promisifyAll(require("fs"));
let mkdirp = require("mkdirp-promise");
let path = require("path");

function setupConfig(configData, logger, path){
    if (
        !configData ||
        typeof(configData) !== "object" ||
        Array.isArray(configData)
    ) {
        return;
    }
    for (let key in configData) {
        let value = configData[key];
        if (typeof(value) === "object") {
            setupConfig(value, logger, (path ? `${path}.` : "") + key);
        } else {
            if (logger) {
                logger(
                    `Setup "${(path ? `${path}.` : "") + key}" with value "${value}"`
                );
            }
            execSync(
                `git config --global ${
                    (path ? `${path}.` : "") + key
                } "${value}"`
            );
        }
    }
}

function checkConditions(criterias){
    let conditions = {};
    if (
        !criterias ||
        typeof(criterias) !== "object" ||
        Array.isArray(criterias)
    ) {
        return conditions;
    }
    return conditions;
}

function updateDataStatus(status, data, url){
    data[url.repo] = data[url.repo] || {};
    data[url.repo][url.branch] = {
        status: status,
        timestamp: Date.now()
    };
    return data;
}

function updateWithStatus(parseUrl, filename, status){
    return new Promise((resolve, reject) => {
        fs.readFileAsync(
            filename
        ).then(data => {
            return yaml.safeLoad(
                data.toString(), {
                    json: true
                }
            );
        }).then(data => {
            return resolve(data);
        }).catch(error => {
            if (error.code !== "ENOENT") {
                return reject(error);
            }
            mkdirp(path.dirname(filename)).then(() => {
                return resolve({});
            }).catch(error => {
                return reject(error);
            });
        });
    }).then(data => {
        data = updateDataStatus(status, data, parseUrl);
        return yaml.safeDump(
            data
        );
    }).then(data => {
        return fs.writeFileAsync(filename, data);
    });
}

function triggerPipeline(pipeline, filename, status, logger){
    if (
        !pipeline ||
        typeof(pipeline) !== "object" ||
        !Array.isArray(pipeline)
    ) {
        return 0;
    }
    for (let url of pipeline) {
        let parseUrl = githubUrl(url);
        if (
            !parseUrl.protocol && !parseUrl.slashes &&
            parseUrl.host && parseUrl.path
        ) {
            parseUrl.host += "/";
        }
        if (!parseUrl.auth) {
            parseUrl.auth = process.env["GH_TOKEN"];
        }
        execSync(
            `git clone ${parseUrl.format()}` +
            ((
                parseUrl.branch && parseUrl.branch !== "master"
            ) ? ` -b ${parseUrl.branch}` : "") +
            ` ${parseUrl.name}`
        );
        updateWithStatus(
            parseUrl, `./${parseUrl.name}/${filename}`, status
        ).then(() => {
            execSync(`git add .`, {
                cwd: `./${parseUrl.name}`
            });
            execSync(`git commit -m "pipeline triggered"`, {
                cwd: `./${parseUrl.name}`
            });
            execSync(`git push origin`, {
                cwd: `./${parseUrl.name}`
            });
        }).catch(error => {
            if (logger) {
                logger(error);
            }
            process.exit(3);
            return 0;
        });
    }

    return 1;
}

class Pipeline {
    constructor(filename, logger){
        this.filename = filename;
        this.logger = logger;
    }

    withStatus(status){
        this.status = status;
        return this;
    }

    withConditions(conditions){
        this.conditions = conditions;
        return this;
    }

    trigger(triggers){
        if (!triggers) {
            if (this.logger) {
                this.logger("No trigger found.");
            }
            return;
        }
        if (typeof(this.status) !== "boolean") {
            if (this.logger) {
                this.logger("Build status is required.");
            }
            process.exit(2);
            return;
        }
        let triggered = 0;
        let triggerKey = undefined;
        let triggerKeys = Object.keys(triggers);
        if (
            this.conditions &&
            typeof(this.conditions) === "object" &&
            !Array.isArray(this.conditions)
        ) {
            let matchedKey = triggerKeys.find(triggerKey => {
                return this.conditions[triggerKey];
            });
            if (matchedKey) {
                triggerKey = matchedKey;
            } else {
                triggerKey = "default";
            }
        }

        if (triggerKey) {
            if (this.logger) {
                this.logger(`Triggering ${triggerKey}...`);
            }
            triggered |= triggerPipeline(
                triggers[triggerKey], this.filename, this.status, this.logger
            );
        }
        if (triggers["any"]) {
            if (this.logger) {
                this.logger(`Triggering pipeline...`);
            }
            triggered |= triggerPipeline(
                triggers["any"], this.filename, this.status, this.logger
            );
        }
        if (!triggered) {
            if (this.logger) {
                this.logger("No trigger found.");
            }
        }
    }
}

function pipeline(filename, logger){
    return new Pipeline(filename, logger);
}

module.exports = {
    setupConfig, setupConfig,
    checkConditions: checkConditions,
    pipeline: pipeline
};
