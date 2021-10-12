# arc_sample_client
Bellus3D ARC Sample Client App

## Configure the environment

### Install the ARC system
To install ARC, double click on the ARC installer (Windows Host Software) and follow the steps.

### Start the host servers
The host servers have to be running before opening the Sample App. To start the host server, locate `Bellus3D ARC Host.exe` in the ARC installer folder, excute `"Bellus3D ARC Host.exe" --action=start-host-and-wait`. Once the command exits with no error message, the host servers are up.

### Edit the Sample App configure file
The Sample App connects to the host through the websocket DEV API server. The default server address is `ws://127.0.0.1:3003`, which is defined in `/javascript/config.js`. On the host side, you can choose to start the server with a different port, if that is the case, please make sure you update the port in the above address.

A note for our previous developers: starting from version 1.16.x, SDK client credential authentication is not required anymore, so we removed the credential related fields in the config file.

## Run the ARC Sample Scan App
This repo currently provides a set of Sample Apps writen in JavaScript. Based on different features, we have 3 different Sample Apps. All Sample Apps are designed to run out of box, no compilation required.

- The Scan Sample App:  locates at `/javascript/scan.html`.
- The Station Configure Sample App: locates at `/javascript/station-configuration.html`.
- The Batch Capture Sample App: locates at `/javascript/batch-capture.html`.

For each Sample App, we just need to double click it to open from browser. All the above Apps are tested in Chrome, Firefox and Safari.

## The Sample App Code Structure
All the Sample Apps are straight forward HTML/JavaScript/CSS combinations. For each App, the main Javascript logic and HTML are packed in a single file, with proper amount of comments to explain the workflows. There are 3 common modules which are shared cross the Apps.
- The GLTF parsing module. The host send camera snap/streaming frames in GLTF format. We use `/javascript/lib/gltfutils.js` to decode the binary.
- The Websocket DEV API communication module. The connection between the Apps and the host are based on websockets. The Apps sends requests in JSON and expects a response from the host. This module (`/javascript/lib/b3d4api.js`) encapsulates the request/response and provides a set of Promise based interfaces.
- The Model Viewer. A THREE.JS based webviewer for rendering the GLB model in a browser. This module provides only two interfaces `window.webViewer.init()` and `window.webViewer.showModel()` for demo purposes only.

