// 🔧 helpers.js - ORGANIZED BY FUNCTIONALITY

/**
 * @file Installation helpers and core logic
 */

import { execSync } from "child_process"
import path from "path"
import fs from "fs"
import { createUpdateScripts, validateGeneratedScripts } from "./update-scripts.js"

// ============================================================================
// 🎯 MAIN ORCHESTRATOR
// ============================================================================

export async function installProject(options) {
    const { projectName, question, target, targetType } = options
    const targetPath = path.resolve(process.cwd(), projectName)

    // Validation
    if (fs.existsSync(targetPath)) {
        console.error(`❌ The directory ${projectName} already exists.`)
        process.exit(1)
    }

    console.log(`🌳 Creating a new Aether CMS project in ${projectName}...`)

    if (target !== "latest") {
        console.log(`🎯 Target: ${targetType} = ${target}`)
    }

    // Execute installation steps

    // Clone the repository
    const cloneSuccess = await cloneRepository(targetPath, options)
    if (!cloneSuccess) {
        process.exit(1)
    }

    createProjectFiles(targetPath, options)
    await installDependencies(targetPath)

    // Setup git with enhanced configuration and pass question function
    await setupGitRepository(targetPath, question)

    console.log(getSuccessMessage(projectName, targetPath))
}

// ============================================================================
// 🔄 GIT OPERATIONS
// ============================================================================

/**
 * Enhanced git repository setup optimized for updates
 */
async function setupGitRepository(targetPath, question) {
    try {
        process.chdir(targetPath)

        console.log("🔄 Setting up git repository...")

        // The repository was cloned, so origin already points to the template repo
        // Rename origin to upstream for future updates
        try {
            execSync("git remote rename origin upstream", {
                stdio: "ignore",
            })
            console.log("✅ Configured upstream remote for updates")
        } catch (error) {
            // If rename fails, try the manual approach
            try {
                execSync("git remote remove origin", {
                    stdio: "ignore",
                })
                execSync("git remote add upstream https://github.com/zeluis/create-aether-cms16.git", {
                    stdio: "ignore",
                })
                console.log("✅ Set up upstream remote for updates")
            } catch (error2) {
                console.log("⚠️ Could not set up upstream remote:", error2.message)
            }
        }

        // Configure git for better merging
        execSync("git config merge.ours.driver true", {
            stdio: "ignore",
        })
        execSync("git config pull.rebase false", {
            stdio: "ignore",
        })

        // Ask about user's own repository
        const answer = await question("Connect to your own Git repository? (y/n): ")

        if (answer.toLowerCase() === "y") {
            const repoUrl = await question("Enter your repository URL (or press Enter to skip): ")
            if (repoUrl.trim()) {
                try {
                    execSync(`git remote add origin ${repoUrl.trim()}`, {
                        stdio: "ignore",
                    })
                    console.log("✅ Added your repository as origin")

                    const pushNow = await question("Push now? (y/n): ")
                    if (pushNow.toLowerCase() === "y") {
                        try {
                            execSync("git push -u origin main", {
                                stdio: "inherit",
                            })
                            console.log("✅ Pushed to your repository")
                        } catch (pushError) {
                            console.log("⚠️ Push failed:", pushError.message)
                            console.log("💡 You can push later with: git push -u origin main")
                        }
                    }
                } catch (error) {
                    console.log("⚠️ Could not add origin remote:", error.message)
                }
            }
        }

        // Create a commit to mark the project initialization
        execSync("git add .", {
            stdio: "ignore",
        })
        execSync('git commit -m "Initialize Aether CMS project"', {
            stdio: "ignore",
        })

        console.log("✅ Git configured for seamless updates")
    } catch (error) {
        console.log("⚠️ Git setup failed:", error.message)
    }
}

// ============================================================================
// 📥 REPOSITORY OPERATIONS
// ============================================================================

/**
 * Clone repository with specific version targeting
 */
async function cloneRepository(targetPath, options) {
    const repoUrl = "https://github.com/zeluis/create-aether-cms16.git"

    try {
        // Always do a full clone first
        console.log(`📥 Cloning Aether CMS repository...`)
        execSync(`git clone ${repoUrl} ${targetPath}`, {
            stdio: "inherit",
        })

        process.chdir(targetPath)

        // Handle specific version targeting with unified approach
        const target = options.hash || options.tag || options.version
        const targetType = options.hash ? "commit" : options.tag ? "tag" : "version"

        if (target && target !== "latest") {
            console.log(`🎯 Switching to ${targetType} ${target}...`)

            // Suppress the detached HEAD warning for cleaner output
            execSync(`git -c advice.detachedHead=false checkout ${target}`, {
                stdio: "inherit",
            })
        }

        // Handle branch creation from current state
        await ensureMainBranchFromCurrentState(target, targetType)

        return true
    } catch (error) {
        console.error("❌ Failed to clone repository:", error.message)
        return false
    }
}

/**
 * Create main branch from current state instead of switching to main
 */
async function ensureMainBranchFromCurrentState(target, targetType) {
    try {
        // Check if we're in detached HEAD state
        const currentBranch = execSync('git symbolic-ref --short HEAD 2>/dev/null || echo ""', {
            encoding: "utf8",
            shell: true,
        }).trim()

        if (!currentBranch) {
            // We're in detached HEAD, create main branch from current state
            console.log(`🔄 Creating main branch from current state (${target || "latest"})...`)
            await createMainBranchFromCurrent()
        } else if (currentBranch !== "main") {
            // We're on a different branch, create main from current state
            console.log(`🔄 Creating main branch from ${targetType} ${target || "latest"}...`)
            try {
                execSync("git checkout -b main", {
                    stdio: "ignore",
                })
            } catch {
                // If main already exists, force update it to current state
                const currentCommit = execSync("git rev-parse HEAD", {
                    encoding: "utf8",
                }).trim()
                execSync(`git branch -f main ${currentCommit}`, {
                    stdio: "ignore",
                })
                execSync("git checkout main", {
                    stdio: "ignore",
                })
            }
        }

        console.log("✅ Main branch setup complete")
    } catch (branchError) {
        console.warn("⚠️ Branch setup warning:", branchError.message)
        console.log("💡 Continuing with current git state...")
    }
}

/**
 * Create main branch from current HEAD with fallback methods
 */
async function createMainBranchFromCurrent() {
    const strategies = [
        // Modern git
        () => execSync("git switch -c main", { stdio: "ignore" }),
        // Traditional git
        () => execSync("git checkout -b main", { stdio: "ignore" }),
        // Manual branch creation
        () => {
            const currentCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim()
            execSync(`git branch main ${currentCommit}`, { stdio: "ignore" })
            execSync("git checkout main", { stdio: "ignore" })
        },
    ]

    for (const strategy of strategies) {
        try {
            strategy()
            return
        } catch (error) {
            if (strategy === strategies[strategies.length - 1]) {
                throw error
            }
        }
    }
}

// ============================================================================
// 🔍 VALIDATION FUNCTIONS
// ============================================================================

/**
 * Checks the Node.js version and exits if the version is less than 18.
 */
export function checkNodeVersion() {
    const currentVersion = process.versions.node
    const majorVersion = parseInt(currentVersion.split(".")[0], 10)

    if (majorVersion < 18) {
        console.error(`Node.js v${currentVersion} is not supported. Please upgrade to Node.js v18 or higher.`)
        process.exit(1)
    }
}

/**
 * Validates the project name.
 * @param {string} projectName - The name to validate
 * @returns {boolean} - Whether the name is valid
 */
export function validateProjectName(projectName) {
    // Check if the name is valid for npm
    return /^[a-z0-9-_]+$/i.test(projectName)
}

/**
 * Validate version/tag/hash exists in repository
 */
export async function validateTarget(target, type) {
    if (type === "hash" || target === "latest") {
        return true // Will validate after cloning
    }

    try {
        const repoUrl = "https://github.com/zeluis/aether-cms16.git"
        const tags = execSync(`git ls-remote --tags ${repoUrl}`, {
            encoding: "utf8",
        })
        const targetExists = tags.includes(`refs/tags/${target}`)

        if (!targetExists) {
            console.error(`❌ Version/tag '${target}' not found`)

            // Show available versions
            const available = tags
                .split("\n")
                .filter((line) => line.includes("refs/tags/"))
                .map((line) => line.match(/refs\/tags\/(.+)$/)?.[1])
                .filter(Boolean)
                .filter((tag) => !tag.includes("^{}"))
                .sort()
                .reverse()

            if (available.length > 0) {
                console.log("\n📋 Available versions:")
                available.slice(0, 10).forEach((v) => console.log(`  ${v}`))
                if (available.length > 10) {
                    console.log(`  ... and ${available.length - 10} more`)
                }
            }
            return false
        }

        return true
    } catch (error) {
        console.warn("⚠️ Could not validate target:", error.message)
        return true
    }
}

// ============================================================================
// 📝 ARGUMENT PARSING
// ============================================================================

/**
 * Parse command line arguments for version targeting
 */
export function parseArguments() {
    const args = process.argv.slice(2)
    const options = {
        projectName: null,
        version: "latest",
        tag: null,
        hash: null,
        help: false,
    }

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]

        if (arg === "--help" || arg === "-h") {
            options.help = true
        } else if (arg === "--version" || arg === "-v") {
            options.version = args[++i]
        } else if (arg === "--tag" || arg === "-t") {
            options.tag = args[++i]
        } else if (arg === "--hash" || arg === "--commit") {
            options.hash = args[++i]
        } else if (!options.projectName) {
            options.projectName = arg
        }
    }

    return options
}

/**
 * Show help message with version targeting options
 */
export function showHelp() {
    console.log(`
create-aether-cms - Create a new Aether CMS project

Usage:
  npx create-aether-cms <project-name> [options]

Options:
  --version, -v <version>    Install specific version (e.g., v1.2.0, latest)
  --tag, -t <tag>           Install specific git tag
  --hash, --commit <hash>   Install specific commit hash
  --help, -h                Show this help message

Examples:
  npx create-aether-cms my-blog
  npx create-aether-cms my-blog --version v1.2.0
  npx create-aether-cms my-blog --tag stable
  npx create-aether-cms my-blog --hash abc1234

Note: Priority order is: hash > tag > version
    `)
}

// ============================================================================
// 📄 FILE CREATION FUNCTIONS
// ============================================================================

/**
 * Creates a .env file with initial settings.
 * @param {string} targetPath - The project directory
 */
function createEnvFile(targetPath) {
    const envContent = `PORT=8080
NODE_ENV=development`

    fs.writeFileSync(path.join(targetPath, ".env"), envContent)
    console.log("📄 Created .env file with default settings")
}

/**
 * Enhanced package.json update that prevents future update conflicts with version tracking
 * @param {string} targetPath - The project directory
 * @param {string} projectName - The name of the project
 * @param {Object} options - Installation options with version info
 */
function updatePackageJson(targetPath, projectName, options) {
    const packageJsonPath = path.join(targetPath, "package.json")

    if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))

        // Get the actual version we installed
        let installedVersion = "unknown"
        try {
            if (options.hash) {
                installedVersion = options.hash
            } else if (options.tag) {
                installedVersion = options.tag
            } else if (options.version && options.version !== "latest") {
                installedVersion = options.version
            } else {
                // Get current commit hash for latest
                installedVersion = execSync("git rev-parse HEAD", {
                    encoding: "utf8",
                    cwd: targetPath,
                })
                    .trim()
                    .substring(0, 7)
            }
        } catch (error) {
            console.warn("⚠️ Could not determine installed version")
        }

        // Store comprehensive template info for updates
        const originalTemplate = {
            templateName: packageJson.name,
            templateVersion: packageJson.version,
            templateRepository: packageJson.repository,
            installedVersion,
            installedAt: new Date().toISOString(),
            installedFrom: "create-aether-cms",
            installOptions: {
                version: options.version,
                tag: options.tag,
                hash: options.hash,
            },
        }

        // Update with user-specific values
        packageJson.name = projectName
        packageJson.version = "0.1.0"
        packageJson.private = true

        // Add enhanced metadata for update system
        packageJson.aetherCMS = originalTemplate

        // Ensure required scripts exist
        packageJson.scripts = packageJson.scripts || {}
        packageJson.scripts.start = packageJson.scripts.start || "node index.js"
        packageJson.scripts.build = packageJson.scripts.build || "node assets/js/generate-static.js --"
        packageJson.scripts["check-updates"] = "node assets/js/check-updates.js"
        packageJson.scripts["update-aether"] = "node assets/js/update-aether.js"

        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
        console.log(`📦 Updated package.json (installed: ${installedVersion})`)
    }
}

/**
 * Handle package-lock.json to prevent update conflicts
 * @param {string} targetPath - The project directory
 * @param {string} projectName - The name of the project
 */
function updatePackageLockJson(targetPath, projectName) {
    const packageLockPath = path.join(targetPath, "package-lock.json")

    if (fs.existsSync(packageLockPath)) {
        try {
            const packageLock = JSON.parse(fs.readFileSync(packageLockPath, "utf8"))

            // Update the name in package-lock.json to match our project
            packageLock.name = projectName
            packageLock.version = "0.1.0"

            // Update the root package reference
            if (packageLock.packages && packageLock.packages[""]) {
                packageLock.packages[""].name = projectName
                packageLock.packages[""].version = "0.1.0"
            }

            fs.writeFileSync(packageLockPath, JSON.stringify(packageLock, null, 2))
            console.log("🔒 Updated package-lock.json to prevent conflicts")
        } catch (error) {
            console.warn("⚠️ Could not update package-lock.json:", error.message)
            console.log("💡 This will be regenerated during npm install")
        }
    }
}

/**
 * Create .gitattributes file for conflict-free updates
 * @param {string} targetPath - The project directory
 */
function createGitAttributes(targetPath) {
    const gitAttributesContent = `# Aether CMS - Prevent merge conflicts on user-specific files
package.json merge=ours
package-lock.json merge=ours
.env merge=ours
content/data/settings.json merge=ours
.gitignore merge=ours

# Handle binary files
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.pdf binary
*.zip binary
`

    fs.writeFileSync(path.join(targetPath, ".gitattributes"), gitAttributesContent)
    console.log("⚙️ Created .gitattributes for conflict-free updates")
}

/**
 * Creates default content structure with update-friendly settings
 * @param {string} targetPath - The project directory
 */
function createDefaultContent(targetPath) {
    // Create content directories
    const contentDirs = [
        "content/data",
        "content/themes",
        "content/uploads/images",
        "content/uploads/documents",
        "content/cache/marketplace",
    ]

    contentDirs.forEach((dir) => {
        const dirPath = path.join(targetPath, dir)
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, {
                recursive: true,
            })
        }
    })

    // Create enhanced settings file
    const settingsFile = path.join(targetPath, "content/data/settings.json")
    if (!fs.existsSync(settingsFile)) {
        const settingsContent = {
            siteTitle: "My Aether Site",
            siteDescription: "A site built with Aether CMS",
            postsPerPage: 10,
            activeTheme: "default",
            footerCode: "Content in Motion. Powered by Aether.",
            // Enhanced update system settings
            updateSettings: {
                autoCheck: true,
                checkInterval: 14400000, // 4 hours
                notifyAdmin: true,
                updateChannel: "stable",
                lastChecked: null,
                conflictResolution: "preserve-user-settings",
            },
            // Preserve user customizations during updates
            userCustomizations: {
                createdAt: new Date().toISOString(),
                preserveOnUpdate: true,
            },
        }

        fs.writeFileSync(settingsFile, JSON.stringify(settingsContent, null, 2))
    }

    console.log("📁 Created update-friendly content structure")
}

// ============================================================================
// 🔧 INTERNAL HELPERS (not exported)
// ============================================================================

function createProjectFiles(targetPath, options) {
    // Enhanced setup with conflict prevention
    createEnvFile(targetPath)
    updatePackageJson(targetPath, options.projectName, options)
    updatePackageLockJson(targetPath, options.projectName)
    createGitAttributes(targetPath)
    createDefaultContent(targetPath)

    // Create update scripts
    try {
        console.log("📜 Creating update scripts...")
        createUpdateScripts(targetPath)

        // Validate the generated scripts
        if (!validateGeneratedScripts(targetPath)) {
            console.warn("⚠️ Generated scripts may have issues, but continuing...")
        } else {
            console.log("✅ Update scripts validated successfully")
        }
    } catch (scriptError) {
        console.error("❌ Failed to create update scripts:", scriptError.message)
        console.log("💡 You can create them manually later")
        // Don't exit - continue with the rest of the setup
    }
}

async function installDependencies(targetPath) {
    process.chdir(targetPath)
    console.log("📦 Installing dependencies...")
    execSync("npm install", { stdio: "inherit" })
}

function getSuccessMessage(projectName, targetPath) {
    return `
🎉 Success! Created ${projectName} at ${targetPath}

🚀 Get started:
    cd ${projectName}
    npm start

🔑 Default credentials:
    Username: admin
    Password: admin

🔄 Update commands:
    npm run check-updates    # Check for updates
    npm run update-aether    # Apply updates safely

📚 Documentation: https://aether-cms.pages.dev/
    `
}
