var app = require('app');
var ipc = require('ipc');
var http = require('http');
var fs = require('fs-extra');
var os = require('os');
var dialog = require('dialog');
var BrowserWindow = require('browser-window');

var mainWindow = null;
var userdir = app.getPath('userData');

app.commandLine.appendSwitch('--enable-npapi');

ipc.on("exit", function(id) {
    mainWindow.destroy();
});

// Quit when all windows are closed.
app.on('window-all-closed', function() {
    if (process.platform != 'darwin')
        app.exit();
});

function verifyUnity() {
    var dllpath =
        app.getPath("appData") +
        "\\..\\LocalLow\\Unity\\WebPlayer\\player\\fusion-2.x.x\\webplayer_win.dll";

    if (fs.existsSync(dllpath)) {
        var buff = fs.readFileSync(dllpath);
        var hash = require("crypto")
            .createHash("md5")
            .update(buff)
            .digest("hex");
        if (hash == "e5028405b4483de9e5e5fe9cd5f1e98f") {
            return true;
        }
    }
    return false;
}

function verifyBundle(path, hash) {
    if (fs.existsSync(path)) {
        var buff = fs.readFileSync(path);
        var hashToCheck = require("crypto")
            .createHash("md5")
            .update(buff)
            .digest("hex");
        if (hashToCheck == hash) {
            return true;
        }
    }
    return false;
}

function verifyBundles(data) {
    var record = userdir + '\\.lastverify';
    var time = Math.floor(new Date().getTime()/1000.0);
    var write_to_file = time.toString() + "\\n" + time.toString();
    var verify_level = 1;
    if (fs.existsSync(record)) {
        var last_verify = fs.readFileSync(record).toString().split("\\n");

        verify_level = 0;
        if (time > parseInt(last_verify[0]) + 86400) {
            verify_level = 1;
            last_verify[0] = time.toString()
        }
        if (time > parseInt(last_verify[1]) + 2592000) {
            verify_level = 2;
            last_verify[1] = time.toString()
        }
        write_to_file = last_verify[0] + "\\n" + last_verify[1]
    }

    var hashes = data.toString().split("\\n");

    var bundle_path = app.getPath("appData") + "\\..\\LocalLow\\Unity\\Web Player\\Cache\\FusionFall";
    var logs = ""

    var count = 0;
    for (var filedata of hashes) {
        count += 1;
        if (count > 1 && verify_level == 0) {
            break;
        }
        if (count > 20 && verify_level != 2) {
            break;
        }
        file = filedata.replace(/(\\r\\n|\\n|\\r)/gm, "").split(":");
        if (file[0] == "") {
            continue;
        }
        path = bundle_path + "\\\\" + file[0];
        logs += path + "\\n"
        if (!verifyBundle(path, file[1])) {
            if (fs.existsSync(path)) {
                fs.removeSync(path);
                logs += "removed\\n";
                if (verify_level < 2) {
                    verify_level = 2;
                    write_to_file = time.toString() + "\\n" + time.toString();
                }
            } else {
                logs += "does not exist\\n";
            }
        }
    }

    try {
        fs.writeFileSync(record, write_to_file);
    } catch(e) {
        console.log(e);
    }

    var logs_path = userdir + '\\md5_check_logs.txt'
    fs.writeFileSync(logs_path, logs);
}

function verifyBundlesUrl(url) {
    var hashfile_path = userdir + '\\.hashes'
    var hashfile = fs.createWriteStream(hashfile_path);

    http.get(url, function(res) {
        res.pipe(hashfile);
        hashfile.on('finish', function() {
            hashfile.close();
            verifyBundles(fs.readFileSync(hashfile_path));
        });
    });
}

function installUnity(callback) {
    var utilsdir = __dirname + "\\..\\..\\utils";

    // run the installer silently
    var child = require("child_process").spawn(
        utilsdir + "\\UnityWebPlayer.exe",
        ["/quiet", "/S"]
    );
    child.on("exit", function () {
        // overwrite 3.5.2 loader/player with FF's custom version
        var dstfolder =
            app.getPath("appData") + "\\..\\LocalLow\\Unity\\WebPlayer";
        fs.copySync(utilsdir + "\\WebPlayer", dstfolder);
        // avoids error reporter popping up when closing Electron
        fs.removeSync(dstfolder + "\\UnityBugReporter.exe");
        console.log("Unity Web Player installed successfully.");
        callback();
    });
}

app.on('ready', function() {
    // Check just in case the user forgot to extract the zip.
    zip_check = app.getPath('exe').includes(os.tmpdir());

    if (zip_check) {
        errormsg = 
        ( "It has been detected that Retrobution is running from the TEMP folder.\\n\\n"+
            "Please extract the entire client folder to a location of your choice before starting Retrobution.");
        dialog.showErrorBox("Error!", errormsg);
        return;
    }

    // Create the browser window.
    mainWindow = new BrowserWindow({width: 1280, height: 720, show: false, "web-preferences": {"plugins": true}});
    mainWindow.setMinimumSize(640, 480);

    var gameversion = 'retrobution'
    var cachedir = userdir + '\\..\\..\\LocalLow\\Unity\\Web Player\\Cache';
    var curversion = cachedir + '\\Fusionfall';
    var newversion = cachedir + '\\' + gameversion;
    var record = userdir + '\\..\\OpenFusionClient\\.lastver';

    // Check for OpenFusion directory
    if (!fs.existsSync(userdir+'\\..\\OpenFusionClient')) {
        fs.mkdirSync(userdir+'\\..\\OpenFusionClient');
    }

    var lastversion = 'retrobution'
    if (fs.existsSync(record)) {
        lastversion = fs.readFileSync(record);
    } else if (fs.existsSync(newversion)) {
        try {
            if (fs.existsSync(curversion)) {
                fs.removeSync(curversion);
            }
            fs.renameSync(newversion, curversion);
        } catch(e) {
            console.log(e);
        }
    }

    if (lastversion != gameversion) {
        try {
            fs.renameSync(curversion, cachedir + '\\' + lastversion);
            if (fs.existsSync(newversion)) {
                fs.renameSync(newversion, curversion);
            }
        } catch(e) {
            console.log(e);
        }
    }

    try {
        fs.writeFileSync(record, gameversion);
    } catch(e) {
        console.log(e);
    }

    if (verifyUnity()) {
        showMainWindow()
    } else {
        installUnity(showMainWindow);
    }

    // Makes it so external links are opened in the system browser, not Electron
    mainWindow.webContents.on('new-window', function(e, url) {
        e.preventDefault();
        require('shell').openExternal(url);
    });

    mainWindow.on('closed', function() {
        mainWindow = null;
    });
});

function showMainWindow() {
    mainWindow.loadUrl('http://207.246.64.70/index.html'+'?dt='+(new Date()).getTime());

    // Reduces white flash when opening the program
    mainWindow.webContents.on('did-finish-load', function() {
        mainWindow.show();
        verifyBundlesUrl('http://207.246.64.70/bundles_md5.txt');
    });

    mainWindow.webContents.on('plugin-crashed', function() {
        console.log("Unity Web Player crashed.");
        dialog.showErrorBox("Unity Web Player Crashed", "The client has crashed, this is likely because the operating system's locale settings not supporting unicode.");
    });

    mainWindow.webContents.on('will-navigate', function(evt, url) {
        evt.preventDefault();
        // Handle known URLs or provide error messages
        switch (url) {
            case "https://fusionfalluniverse.com/account/register":
                dialog.showErrorBox("Sorry!", 
                "The register page is currently unimplemented.\\n\\n"+
                "You can still create an account by typing your desired username and password into the provided boxes and clicking 'Log In'. Your account will then be automatically created on the server.");
                break;
            case "https://fusionfalluniverse.com/account":
                dialog.showErrorBox("Sorry!", "Account management is not available.");
                break;
            case "http://www.forums.fusionfalluniverse.com/":
                require('shell').openExternal("https://discord.gg/HNbfJXS2kW");
                break;
            default:
                dialog.showErrorBox("Load URL Fail!", url);
        }
    });
}