<h1 align="center">
  <br>
    <img src="lib/icon.png" alt="logo" width="200">
  <br>
  RemoteDebug iOS WebKit Adapter
  <br>
  <br>
</h1>

<h4 align="center">Debug your websites running on iOS devices connected to your computer over USB. </h4>

<p align="center">
  <a href="https://travis-ci.com/RemoteDebug/remotedebug-ios-webkit-adapter"><img src="https://travis-ci.com/RemoteDebug/remotedebug-ios-webkit-adapter.svg?token=WQL8U9tKa9M9yQmjXHTp" alt="Travis"></a>
  <a href="https://github.com/RemoteDebug/remotedebug-ios-webkit-adapter/releases"><img src="https://img.shields.io/github/release/RemoteDebug/remotedebug-ios-webkit-adapter.svg" alt="Release"></a>
</p>

RemoteDebug iOS WebKit Adapter is an protocol adapter that enables tools compatible with the [RemoteDebug Core Protocol Specification]() to work with Safari Mobile / WebKit instances running in iOS devices. 

## Getting Started

1. Install dependencies

Before you use this adapter you need to make sure you have the [latest version of iTunes](http://www.apple.com/itunes/download/) installed, as we need a few libraries provided by iTunes to talk to the iOS devices.

#### Windows
You should be good to go.

#### OSX/Mac
Make sure you have Homebrew installed, and run the following command to install [ios-webkit-debug-proxy](https://github.com/google/ios-webkit-debug-proxy) and [libimobiledevice](https://github.com/libimobiledevice/libimobiledevice)

```
brew install libimobiledevice
brew install ios-webkit-debug-proxy
```

2. Instal latest version of the adapter

```
npm install remotedebug-ios-webkit-adapter -g
```

3. Run the adapter from your favorite commandline

```
remotedebug_ios_webkit_adapter --port=9000
```

4. Open your favorite tool such as Chrome DevTool or Visual Studio Code and configure the tool to connect to the protocol adapter.


## Options and configuration

## How to contribute

```
npm install
npm start
```

### License
TBD

### Code of Conduct
This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
