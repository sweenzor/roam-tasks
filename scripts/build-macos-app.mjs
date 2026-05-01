import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(join(repoDir, "package.json"), "utf8"));
const electronApp = join(repoDir, "node_modules", "electron", "dist", "Electron.app");
const distDir = join(repoDir, "dist");
const appName = "Roam Tasks";
const bundleId = "local.roam-tasks";
const iconName = "roam-tasks-check.icns";
const iconPath = join(repoDir, "assets", "app-icon.icns");
const appBundle = join(distDir, `${appName}.app`);
const resourcesDir = join(appBundle, "Contents", "Resources");
const appResourcesDir = join(resourcesDir, "app");
const plistPath = join(appBundle, "Contents", "Info.plist");
const macosDir = join(appBundle, "Contents", "MacOS");
const frameworksDir = join(appBundle, "Contents", "Frameworks");

if (!existsSync(electronApp)) {
  throw new Error("Electron is not installed. Run `npm install` in this repo first.");
}

await rm(appBundle, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await cp(electronApp, appBundle, { recursive: true, verbatimSymlinks: true });
await rm(join(resourcesDir, "default_app.asar"), { force: true });
await rm(join(resourcesDir, "default_app.asar.unpacked"), { recursive: true, force: true });
await rm(join(resourcesDir, "electron.icns"), { force: true });
await mkdir(appResourcesDir, { recursive: true });
if (existsSync(iconPath)) await cp(iconPath, join(resourcesDir, iconName));

await writeFile(
  join(appResourcesDir, "package.json"),
  JSON.stringify(
    {
      name: packageJson.name,
      version: packageJson.version,
      private: true,
      type: packageJson.type,
      description: packageJson.description,
      main: packageJson.main
    },
    null,
    2
  )
);

for (const dir of ["electron", "server", "public"]) {
  await cp(join(repoDir, dir), join(appResourcesDir, dir), { recursive: true });
}

await rename(join(macosDir, "Electron"), join(macosDir, appName));
setPlistValue("CFBundleName", appName);
setPlistValue("CFBundleDisplayName", appName);
setPlistValue("CFBundleExecutable", appName);
setPlistValue("CFBundleIdentifier", bundleId);
if (existsSync(iconPath)) setPlistValue("CFBundleIconFile", iconName);
setPlistValue("CFBundleShortVersionString", packageJson.version);
setPlistValue("CFBundleVersion", packageJson.version);
deletePlistKey("ElectronAsarIntegrity");
await renameHelperApps();

console.log(`Built ${appBundle}`);

async function renameHelperApps() {
  const helpers = [
    ["Electron Helper", `${appName} Helper`, `${bundleId}.helper`],
    ["Electron Helper (Renderer)", `${appName} Helper (Renderer)`, `${bundleId}.helper.renderer`],
    ["Electron Helper (GPU)", `${appName} Helper (GPU)`, `${bundleId}.helper.gpu`],
    ["Electron Helper (Plugin)", `${appName} Helper (Plugin)`, `${bundleId}.helper.plugin`]
  ];

  for (const [oldName, newName, helperBundleId] of helpers) {
    const oldApp = join(frameworksDir, `${oldName}.app`);
    const newApp = join(frameworksDir, `${newName}.app`);
    const helperPlist = join(newApp, "Contents", "Info.plist");

    await rename(oldApp, newApp);
    await rename(join(newApp, "Contents", "MacOS", oldName), join(newApp, "Contents", "MacOS", newName));
    setPlistValueAt(helperPlist, "CFBundleName", newName);
    setPlistValueAt(helperPlist, "CFBundleDisplayName", newName);
    setPlistValueAt(helperPlist, "CFBundleExecutable", newName);
    setPlistValueAt(helperPlist, "CFBundleIdentifier", helperBundleId);
  }
}

function setPlistValue(key, value) {
  setPlistValueAt(plistPath, key, value);
}

function setPlistValueAt(path, key, value) {
  const command = `Set :${key} ${value}`;
  try {
    execFileSync("/usr/libexec/PlistBuddy", ["-c", command, path], { stdio: "ignore" });
  } catch {
    execFileSync("/usr/libexec/PlistBuddy", ["-c", `Add :${key} string ${value}`, path], {
      stdio: "ignore"
    });
  }
}

function deletePlistKey(key) {
  try {
    execFileSync("/usr/libexec/PlistBuddy", ["-c", `Delete :${key}`, plistPath], { stdio: "ignore" });
  } catch {
    // The key is Electron-version dependent; absence is fine.
  }
}
