import {
  Encoding
} from "./chunk-JIFRU7F6.js";
import {
  WebPlugin,
  buildRequestInit
} from "./chunk-APPLFF7D.js";
import {
  __async
} from "./chunk-WDMUDEB6.js";

// node_modules/@capacitor/filesystem/dist/esm/web.js
function resolve(path) {
  const posix = path.split("/").filter((item) => item !== ".");
  const newPosix = [];
  posix.forEach((item) => {
    if (item === ".." && newPosix.length > 0 && newPosix[newPosix.length - 1] !== "..") {
      newPosix.pop();
    } else {
      newPosix.push(item);
    }
  });
  return newPosix.join("/");
}
function isPathParent(parent, children) {
  parent = resolve(parent);
  children = resolve(children);
  const pathsA = parent.split("/");
  const pathsB = children.split("/");
  return parent !== children && pathsA.every((value, index) => value === pathsB[index]);
}
var FilesystemWeb = class _FilesystemWeb extends WebPlugin {
  constructor() {
    super(...arguments);
    this.DB_VERSION = 1;
    this.DB_NAME = "Disc";
    this._writeCmds = ["add", "put", "delete"];
    this.downloadFile = (options) => __async(this, null, function* () {
      var _a, _b;
      const requestInit = buildRequestInit(options, options.webFetchExtra);
      const response = yield fetch(options.url, requestInit);
      let blob;
      if (!options.progress) blob = yield response.blob();
      else if (!(response === null || response === void 0 ? void 0 : response.body)) blob = new Blob();
      else {
        const reader = response.body.getReader();
        let bytes = 0;
        const chunks = [];
        const contentType = response.headers.get("content-type");
        const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
        while (true) {
          const {
            done,
            value
          } = yield reader.read();
          if (done) break;
          chunks.push(value);
          bytes += (value === null || value === void 0 ? void 0 : value.length) || 0;
          const status = {
            url: options.url,
            bytes,
            contentLength
          };
          this.notifyListeners("progress", status);
        }
        const allChunks = new Uint8Array(bytes);
        let position = 0;
        for (const chunk of chunks) {
          if (typeof chunk === "undefined") continue;
          allChunks.set(chunk, position);
          position += chunk.length;
        }
        blob = new Blob([allChunks.buffer], {
          type: contentType || void 0
        });
      }
      const result = yield this.writeFile({
        path: options.path,
        directory: (_a = options.directory) !== null && _a !== void 0 ? _a : void 0,
        recursive: (_b = options.recursive) !== null && _b !== void 0 ? _b : false,
        data: blob
      });
      return {
        path: result.uri,
        blob
      };
    });
  }
  initDb() {
    return __async(this, null, function* () {
      if (this._db !== void 0) {
        return this._db;
      }
      if (!("indexedDB" in window)) {
        throw this.unavailable("This browser doesn't support IndexedDB");
      }
      return new Promise((resolve2, reject) => {
        const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
        request.onupgradeneeded = _FilesystemWeb.doUpgrade;
        request.onsuccess = () => {
          this._db = request.result;
          resolve2(request.result);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => {
          console.warn("db blocked");
        };
      });
    });
  }
  static doUpgrade(event) {
    const eventTarget = event.target;
    const db = eventTarget.result;
    switch (event.oldVersion) {
      case 0:
      case 1:
      default: {
        if (db.objectStoreNames.contains("FileStorage")) {
          db.deleteObjectStore("FileStorage");
        }
        const store = db.createObjectStore("FileStorage", {
          keyPath: "path"
        });
        store.createIndex("by_folder", "folder");
      }
    }
  }
  dbRequest(cmd, args) {
    return __async(this, null, function* () {
      const readFlag = this._writeCmds.indexOf(cmd) !== -1 ? "readwrite" : "readonly";
      return this.initDb().then((conn) => {
        return new Promise((resolve2, reject) => {
          const tx = conn.transaction(["FileStorage"], readFlag);
          const store = tx.objectStore("FileStorage");
          const req = store[cmd](...args);
          req.onsuccess = () => resolve2(req.result);
          req.onerror = () => reject(req.error);
        });
      });
    });
  }
  dbIndexRequest(indexName, cmd, args) {
    return __async(this, null, function* () {
      const readFlag = this._writeCmds.indexOf(cmd) !== -1 ? "readwrite" : "readonly";
      return this.initDb().then((conn) => {
        return new Promise((resolve2, reject) => {
          const tx = conn.transaction(["FileStorage"], readFlag);
          const store = tx.objectStore("FileStorage");
          const index = store.index(indexName);
          const req = index[cmd](...args);
          req.onsuccess = () => resolve2(req.result);
          req.onerror = () => reject(req.error);
        });
      });
    });
  }
  getPath(directory, uriPath) {
    const cleanedUriPath = uriPath !== void 0 ? uriPath.replace(/^[/]+|[/]+$/g, "") : "";
    let fsPath = "";
    if (directory !== void 0) fsPath += "/" + directory;
    if (uriPath !== "") fsPath += "/" + cleanedUriPath;
    return fsPath;
  }
  clear() {
    return __async(this, null, function* () {
      const conn = yield this.initDb();
      const tx = conn.transaction(["FileStorage"], "readwrite");
      const store = tx.objectStore("FileStorage");
      store.clear();
    });
  }
  /**
   * Read a file from disk
   * @param options options for the file read
   * @return a promise that resolves with the read file data result
   */
  readFile(options) {
    return __async(this, null, function* () {
      const path = this.getPath(options.directory, options.path);
      const entry = yield this.dbRequest("get", [path]);
      if (entry === void 0) throw Error("File does not exist.");
      return {
        data: entry.content ? entry.content : ""
      };
    });
  }
  /**
   * Write a file to disk in the specified location on device
   * @param options options for the file write
   * @return a promise that resolves with the file write result
   */
  writeFile(options) {
    return __async(this, null, function* () {
      const path = this.getPath(options.directory, options.path);
      let data = options.data;
      const encoding = options.encoding;
      const doRecursive = options.recursive;
      const occupiedEntry = yield this.dbRequest("get", [path]);
      if (occupiedEntry && occupiedEntry.type === "directory") throw Error("The supplied path is a directory.");
      const parentPath = path.substr(0, path.lastIndexOf("/"));
      const parentEntry = yield this.dbRequest("get", [parentPath]);
      if (parentEntry === void 0) {
        const subDirIndex = parentPath.indexOf("/", 1);
        if (subDirIndex !== -1) {
          const parentArgPath = parentPath.substr(subDirIndex);
          yield this.mkdir({
            path: parentArgPath,
            directory: options.directory,
            recursive: doRecursive
          });
        }
      }
      if (!encoding && !(data instanceof Blob)) {
        data = data.indexOf(",") >= 0 ? data.split(",")[1] : data;
        if (!this.isBase64String(data)) throw Error("The supplied data is not valid base64 content.");
      }
      const now = Date.now();
      const pathObj = {
        path,
        folder: parentPath,
        type: "file",
        size: data instanceof Blob ? data.size : data.length,
        ctime: now,
        mtime: now,
        content: data
      };
      yield this.dbRequest("put", [pathObj]);
      return {
        uri: pathObj.path
      };
    });
  }
  /**
   * Append to a file on disk in the specified location on device
   * @param options options for the file append
   * @return a promise that resolves with the file write result
   */
  appendFile(options) {
    return __async(this, null, function* () {
      const path = this.getPath(options.directory, options.path);
      let data = options.data;
      const encoding = options.encoding;
      const parentPath = path.substr(0, path.lastIndexOf("/"));
      const now = Date.now();
      let ctime = now;
      const occupiedEntry = yield this.dbRequest("get", [path]);
      if (occupiedEntry && occupiedEntry.type === "directory") throw Error("The supplied path is a directory.");
      const parentEntry = yield this.dbRequest("get", [parentPath]);
      if (parentEntry === void 0) {
        const subDirIndex = parentPath.indexOf("/", 1);
        if (subDirIndex !== -1) {
          const parentArgPath = parentPath.substr(subDirIndex);
          yield this.mkdir({
            path: parentArgPath,
            directory: options.directory,
            recursive: true
          });
        }
      }
      if (!encoding && !this.isBase64String(data)) throw Error("The supplied data is not valid base64 content.");
      if (occupiedEntry !== void 0) {
        if (occupiedEntry.content instanceof Blob) {
          throw Error("The occupied entry contains a Blob object which cannot be appended to.");
        }
        if (occupiedEntry.content !== void 0 && !encoding) {
          data = btoa(atob(occupiedEntry.content) + atob(data));
        } else {
          data = occupiedEntry.content + data;
        }
        ctime = occupiedEntry.ctime;
      }
      const pathObj = {
        path,
        folder: parentPath,
        type: "file",
        size: data.length,
        ctime,
        mtime: now,
        content: data
      };
      yield this.dbRequest("put", [pathObj]);
    });
  }
  /**
   * Delete a file from disk
   * @param options options for the file delete
   * @return a promise that resolves with the deleted file data result
   */
  deleteFile(options) {
    return __async(this, null, function* () {
      const path = this.getPath(options.directory, options.path);
      const entry = yield this.dbRequest("get", [path]);
      if (entry === void 0) throw Error("File does not exist.");
      const entries = yield this.dbIndexRequest("by_folder", "getAllKeys", [IDBKeyRange.only(path)]);
      if (entries.length !== 0) throw Error("Folder is not empty.");
      yield this.dbRequest("delete", [path]);
    });
  }
  /**
   * Create a directory.
   * @param options options for the mkdir
   * @return a promise that resolves with the mkdir result
   */
  mkdir(options) {
    return __async(this, null, function* () {
      const path = this.getPath(options.directory, options.path);
      const doRecursive = options.recursive;
      const parentPath = path.substr(0, path.lastIndexOf("/"));
      const depth = (path.match(/\//g) || []).length;
      const parentEntry = yield this.dbRequest("get", [parentPath]);
      const occupiedEntry = yield this.dbRequest("get", [path]);
      if (depth === 1) throw Error("Cannot create Root directory");
      if (occupiedEntry !== void 0) throw Error("Current directory does already exist.");
      if (!doRecursive && depth !== 2 && parentEntry === void 0) throw Error("Parent directory must exist");
      if (doRecursive && depth !== 2 && parentEntry === void 0) {
        const parentArgPath = parentPath.substr(parentPath.indexOf("/", 1));
        yield this.mkdir({
          path: parentArgPath,
          directory: options.directory,
          recursive: doRecursive
        });
      }
      const now = Date.now();
      const pathObj = {
        path,
        folder: parentPath,
        type: "directory",
        size: 0,
        ctime: now,
        mtime: now
      };
      yield this.dbRequest("put", [pathObj]);
    });
  }
  /**
   * Remove a directory
   * @param options the options for the directory remove
   */
  rmdir(options) {
    return __async(this, null, function* () {
      const {
        path,
        directory,
        recursive
      } = options;
      const fullPath = this.getPath(directory, path);
      const entry = yield this.dbRequest("get", [fullPath]);
      if (entry === void 0) throw Error("Folder does not exist.");
      if (entry.type !== "directory") throw Error("Requested path is not a directory");
      const readDirResult = yield this.readdir({
        path,
        directory
      });
      if (readDirResult.files.length !== 0 && !recursive) throw Error("Folder is not empty");
      for (const entry2 of readDirResult.files) {
        const entryPath = `${path}/${entry2.name}`;
        const entryObj = yield this.stat({
          path: entryPath,
          directory
        });
        if (entryObj.type === "file") {
          yield this.deleteFile({
            path: entryPath,
            directory
          });
        } else {
          yield this.rmdir({
            path: entryPath,
            directory,
            recursive
          });
        }
      }
      yield this.dbRequest("delete", [fullPath]);
    });
  }
  /**
   * Return a list of files from the directory (not recursive)
   * @param options the options for the readdir operation
   * @return a promise that resolves with the readdir directory listing result
   */
  readdir(options) {
    return __async(this, null, function* () {
      const path = this.getPath(options.directory, options.path);
      const entry = yield this.dbRequest("get", [path]);
      if (options.path !== "" && entry === void 0) throw Error("Folder does not exist.");
      const entries = yield this.dbIndexRequest("by_folder", "getAllKeys", [IDBKeyRange.only(path)]);
      const files = yield Promise.all(entries.map((e) => __async(this, null, function* () {
        let subEntry = yield this.dbRequest("get", [e]);
        if (subEntry === void 0) {
          subEntry = yield this.dbRequest("get", [e + "/"]);
        }
        return {
          name: e.substring(path.length + 1),
          type: subEntry.type,
          size: subEntry.size,
          ctime: subEntry.ctime,
          mtime: subEntry.mtime,
          uri: subEntry.path
        };
      })));
      return {
        files
      };
    });
  }
  /**
   * Return full File URI for a path and directory
   * @param options the options for the stat operation
   * @return a promise that resolves with the file stat result
   */
  getUri(options) {
    return __async(this, null, function* () {
      const path = this.getPath(options.directory, options.path);
      let entry = yield this.dbRequest("get", [path]);
      if (entry === void 0) {
        entry = yield this.dbRequest("get", [path + "/"]);
      }
      return {
        uri: (entry === null || entry === void 0 ? void 0 : entry.path) || path
      };
    });
  }
  /**
   * Return data about a file
   * @param options the options for the stat operation
   * @return a promise that resolves with the file stat result
   */
  stat(options) {
    return __async(this, null, function* () {
      const path = this.getPath(options.directory, options.path);
      let entry = yield this.dbRequest("get", [path]);
      if (entry === void 0) {
        entry = yield this.dbRequest("get", [path + "/"]);
      }
      if (entry === void 0) throw Error("Entry does not exist.");
      return {
        type: entry.type,
        size: entry.size,
        ctime: entry.ctime,
        mtime: entry.mtime,
        uri: entry.path
      };
    });
  }
  /**
   * Rename a file or directory
   * @param options the options for the rename operation
   * @return a promise that resolves with the rename result
   */
  rename(options) {
    return __async(this, null, function* () {
      yield this._copy(options, true);
      return;
    });
  }
  /**
   * Copy a file or directory
   * @param options the options for the copy operation
   * @return a promise that resolves with the copy result
   */
  copy(options) {
    return __async(this, null, function* () {
      return this._copy(options, false);
    });
  }
  requestPermissions() {
    return __async(this, null, function* () {
      return {
        publicStorage: "granted"
      };
    });
  }
  checkPermissions() {
    return __async(this, null, function* () {
      return {
        publicStorage: "granted"
      };
    });
  }
  /**
   * Function that can perform a copy or a rename
   * @param options the options for the rename operation
   * @param doRename whether to perform a rename or copy operation
   * @return a promise that resolves with the result
   */
  _copy(options, doRename = false) {
    return __async(this, null, function* () {
      let {
        toDirectory
      } = options;
      const {
        to,
        from,
        directory: fromDirectory
      } = options;
      if (!to || !from) {
        throw Error("Both to and from must be provided");
      }
      if (!toDirectory) {
        toDirectory = fromDirectory;
      }
      const fromPath = this.getPath(fromDirectory, from);
      const toPath = this.getPath(toDirectory, to);
      if (fromPath === toPath) {
        return {
          uri: toPath
        };
      }
      if (isPathParent(fromPath, toPath)) {
        throw Error("To path cannot contain the from path");
      }
      let toObj;
      try {
        toObj = yield this.stat({
          path: to,
          directory: toDirectory
        });
      } catch (e) {
        const toPathComponents = to.split("/");
        toPathComponents.pop();
        const toPath2 = toPathComponents.join("/");
        if (toPathComponents.length > 0) {
          const toParentDirectory = yield this.stat({
            path: toPath2,
            directory: toDirectory
          });
          if (toParentDirectory.type !== "directory") {
            throw new Error("Parent directory of the to path is a file");
          }
        }
      }
      if (toObj && toObj.type === "directory") {
        throw new Error("Cannot overwrite a directory with a file");
      }
      const fromObj = yield this.stat({
        path: from,
        directory: fromDirectory
      });
      const updateTime = (path, ctime2, mtime) => __async(this, null, function* () {
        const fullPath = this.getPath(toDirectory, path);
        const entry = yield this.dbRequest("get", [fullPath]);
        entry.ctime = ctime2;
        entry.mtime = mtime;
        yield this.dbRequest("put", [entry]);
      });
      const ctime = fromObj.ctime ? fromObj.ctime : Date.now();
      switch (fromObj.type) {
        case "file": {
          const file = yield this.readFile({
            path: from,
            directory: fromDirectory
          });
          if (doRename) {
            yield this.deleteFile({
              path: from,
              directory: fromDirectory
            });
          }
          let encoding;
          if (!(file.data instanceof Blob) && !this.isBase64String(file.data)) {
            encoding = Encoding.UTF8;
          }
          const writeResult = yield this.writeFile({
            path: to,
            directory: toDirectory,
            data: file.data,
            encoding
          });
          if (doRename) {
            yield updateTime(to, ctime, fromObj.mtime);
          }
          return writeResult;
        }
        case "directory": {
          if (toObj) {
            throw Error("Cannot move a directory over an existing object");
          }
          try {
            yield this.mkdir({
              path: to,
              directory: toDirectory,
              recursive: false
            });
            if (doRename) {
              yield updateTime(to, ctime, fromObj.mtime);
            }
          } catch (e) {
          }
          const contents = (yield this.readdir({
            path: from,
            directory: fromDirectory
          })).files;
          for (const filename of contents) {
            yield this._copy({
              from: `${from}/${filename.name}`,
              to: `${to}/${filename.name}`,
              directory: fromDirectory,
              toDirectory
            }, doRename);
          }
          if (doRename) {
            yield this.rmdir({
              path: from,
              directory: fromDirectory
            });
          }
        }
      }
      return {
        uri: toPath
      };
    });
  }
  isBase64String(str) {
    try {
      return btoa(atob(str)) == str;
    } catch (err) {
      return false;
    }
  }
};
FilesystemWeb._debug = true;
export {
  FilesystemWeb
};
//# sourceMappingURL=web-CEYBNWYC.js.map
