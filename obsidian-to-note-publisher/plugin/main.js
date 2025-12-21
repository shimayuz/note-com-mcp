var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", { value: true });
var __export = (target, all) => {
  __markAsModule(target);
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __reExport = (target, module2, desc) => {
  if (module2 && typeof module2 === "object" || typeof module2 === "function") {
    for (let key of __getOwnPropNames(module2))
      if (!__hasOwnProp.call(target, key) && key !== "default")
        __defProp(target, key, { get: () => module2[key], enumerable: !(desc = __getOwnPropDesc(module2, key)) || desc.enumerable });
  }
  return target;
};
var __toModule = (module2) => {
  return __reExport(__markAsModule(__defProp(module2 != null ? __create(__getProtoOf(module2)) : {}, "default", module2 && module2.__esModule && "default" in module2 ? { get: () => module2.default, enumerable: true } : { value: module2, enumerable: true })), module2);
};
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// main.ts
__export(exports, {
  default: () => NotePublisherPlugin
});
var import_obsidian = __toModule(require("obsidian"));
var import_child_process = __toModule(require("child_process"));
var DEFAULT_SETTINGS = {
  cliPath: "npx obsidian-to-note",
  defaultHeadless: true,
  envPath: ""
};
var NotePublisherPlugin = class extends import_obsidian.Plugin {
  onload() {
    return __async(this, null, function* () {
      yield this.loadSettings();
      this.addCommand({
        id: "publish-to-note",
        name: "note\u306B\u516C\u958B",
        editorCallback: (editor, view) => {
          this.publishCurrentFile();
        }
      });
      this.addRibbonIcon("send", "note\u306B\u516C\u958B", (evt) => {
        this.publishCurrentFile();
      });
      this.addSettingTab(new NotePublisherSettingTab(this.app, this));
    });
  }
  onunload() {
  }
  publishCurrentFile() {
    return __async(this, null, function* () {
      var _a, _b;
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        new import_obsidian.Notice("\u30D5\u30A1\u30A4\u30EB\u304C\u958B\u304B\u308C\u3066\u3044\u307E\u305B\u3093");
        return;
      }
      if (activeFile.extension !== "md") {
        new import_obsidian.Notice("\u30DE\u30FC\u30AF\u30C0\u30A6\u30F3\u30D5\u30A1\u30A4\u30EB\u306E\u307F\u516C\u958B\u3067\u304D\u307E\u3059");
        return;
      }
      const filePath = activeFile.path;
      const vaultPath = this.app.vault.adapter.basePath;
      const fullPath = `${vaultPath}/${filePath}`;
      const args = [fullPath];
      if (this.settings.defaultHeadless) {
        args.push("--headless");
      }
      if (this.settings.envPath) {
        args.push("--env", this.settings.envPath);
      }
      const progressNotice = new import_obsidian.Notice("note\u306B\u516C\u958B\u4E2D...", 0);
      try {
        const child = (0, import_child_process.spawn)(this.settings.cliPath, args, {
          stdio: ["pipe", "pipe", "pipe"],
          shell: true,
          cwd: process.cwd()
        });
        let stdout = "";
        let stderr = "";
        (_a = child.stdout) == null ? void 0 : _a.on("data", (data) => {
          stdout += data.toString();
        });
        (_b = child.stderr) == null ? void 0 : _b.on("data", (data) => {
          stderr += data.toString();
        });
        yield new Promise((resolve, reject) => {
          child.on("close", (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`CLI exited with code ${code}`));
            }
          });
          child.on("error", (error) => {
            reject(error);
          });
        });
        progressNotice.hide();
        if (stderr && stderr.includes("\u30A8\u30E9\u30FC")) {
          new import_obsidian.Notice("\u516C\u958B\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF1A" + stderr.trim());
          console.error("Note Publisher Error:", stderr);
        } else {
          new import_obsidian.Notice("\u4E0B\u66F8\u304D\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F\uFF01");
          console.log("Note Publisher Output:", stdout);
        }
      } catch (error) {
        progressNotice.hide();
        new import_obsidian.Notice("\u516C\u958B\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF1A" + error.message);
        console.error("Note Publisher Error:", error);
      }
    });
  }
  loadSettings() {
    return __async(this, null, function* () {
      this.settings = Object.assign({}, DEFAULT_SETTINGS, yield this.loadData());
    });
  }
  saveSettings() {
    return __async(this, null, function* () {
      yield this.saveData(this.settings);
    });
  }
};
var NotePublisherSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Obsidian to note Publisher \u8A2D\u5B9A" });
    new import_obsidian.Setting(containerEl).setName("CLI\u30B3\u30DE\u30F3\u30C9").setDesc("\u5B9F\u884C\u3059\u308BCLI\u30B3\u30DE\u30F3\u30C9\uFF08\u30C7\u30D5\u30A9\u30EB\u30C8: npx obsidian-to-note\uFF09").addText((text) => text.setPlaceholder("npx obsidian-to-note").setValue(this.plugin.settings.cliPath).onChange((value) => __async(this, null, function* () {
      this.plugin.settings.cliPath = value;
      yield this.plugin.saveSettings();
    })));
    new import_obsidian.Setting(containerEl).setName("\u30D8\u30C3\u30C9\u30EC\u30B9\u30E2\u30FC\u30C9").setDesc("\u30D6\u30E9\u30A6\u30B6\u3092\u975E\u8868\u793A\u3067\u5B9F\u884C\u3059\u308B").addToggle((toggle) => toggle.setValue(this.plugin.settings.defaultHeadless).onChange((value) => __async(this, null, function* () {
      this.plugin.settings.defaultHeadless = value;
      yield this.plugin.saveSettings();
    })));
    new import_obsidian.Setting(containerEl).setName(".env\u30D5\u30A1\u30A4\u30EB\u306E\u30D1\u30B9").setDesc("\u8A8D\u8A3C\u60C5\u5831\u304C\u8A18\u8F09\u3055\u308C\u305F.env\u30D5\u30A1\u30A4\u30EB\u306E\u30D1\u30B9\uFF08\u7A7A\u306E\u5834\u5408\u306F\u30AB\u30EC\u30F3\u30C8\u30C7\u30A3\u30EC\u30AF\u30C8\u30EA\uFF09").addText((text) => text.setPlaceholder("/path/to/.env").setValue(this.plugin.settings.envPath).onChange((value) => __async(this, null, function* () {
      this.plugin.settings.envPath = value;
      yield this.plugin.saveSettings();
    })));
    containerEl.createEl("h3", { text: "\u30BB\u30C3\u30C8\u30A2\u30C3\u30D7" });
    const setupDiv = containerEl.createDiv();
    setupDiv.innerHTML = `
			<p>\u3053\u306E\u30D7\u30E9\u30B0\u30A4\u30F3\u3092\u4F7F\u7528\u3059\u308B\u306B\u306F\u3001\u3042\u3089\u304B\u3058\u3081CLI\u30C4\u30FC\u30EB\u3092\u30A4\u30F3\u30B9\u30C8\u30FC\u30EB\u3059\u308B\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059\u3002</p>
			<pre><code># npm\u3067\u30B0\u30ED\u30FC\u30D0\u30EB\u30A4\u30F3\u30B9\u30C8\u30FC\u30EB
npm install -g obsidian-to-note-publisher

# \u307E\u305F\u306F\u30ED\u30FC\u30AB\u30EB\u30A4\u30F3\u30B9\u30C8\u30FC\u30EB
npm install obsidian-to-note-publisher</code></pre>
			<p>\u8A73\u7D30\u306F <a href="https://github.com/shimayuz/obsidian-to-note-publisher">GitHub\u30EA\u30DD\u30B8\u30C8\u30EA</a> \u3092\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044\u3002</p>
		`;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {});
