/*************************************
 *
 *   bellus3d B3D4 dev API wrapper
 *   author: max@bellus3d
 *
 *************************************/
// import gltfutils from "./gltfutils";

// UMD (Universal Module Definition) Pattern Javascript Module
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        // AMD. Register as an anonymous module.
        define(["gltfutils"], factory);
    } else if (typeof module === "object" && module.exports) {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like environments that support module.exports,
        // like Node.
        module.exports = factory(require("./gltfutils"));
    } else {
        // Browser globals (root is window)
        root.B3d4api = factory(root.gltfutils);
    }
})(typeof self !== "undefined" ? self : this, function (gltfutils) {
    // rule to determine if the dev api returns success status
    const apiSuccess = response => {
        return response && response.status && !response.status.match(/error/i);
    };

    // below are some default message(event) handlers,
    // these function will be called in B3d4api instance's context, i.e.
    // 'this' will refer to a B3d4api instance
    const defaultMessageHandlers = {
        "connection:open": function (event) {},
        "connection:close": function (event) {
            // reject current connection request, if not resolved yet
            this._respondClientRequest("connect", {
                status: "ERROR",
                response_to: "connect",
                error: { message: `websocket connection closed, code: ${event.code}` },
                event
            });
        },
        "response:connect": function (msg) {
            if (apiSuccess(msg)) {
                this.sessionId = msg.session_id;
            }
        },
        "response:station_list": function (msg) {
            if (apiSuccess(msg)) {
                this.stations = msg.stations;
            }
        },
        "response:station_select": function (msg) {
            if (apiSuccess(msg)) {
                this.currentStationId = msg.station_id;
            }
        }
    };

    //
    // B3D4 websocket dev API client
    class B3d4api {
        constructor(host) {
            this.host = host;
            this.ws = null;
            // api state
            this.sessionId = null;
            this.stations = null;
            this.currentStationId = null;
            // message handlers
            this.messageHandlers = {};
            // current open requests waiting for server responses
            this.openClientRequests = {};
            // keep lastRequestTimestamp to avoid auto assign the same requestId in a short time
            this.lastRequestTimestamp = null;
            // set built-in handlers
            this._setDefaultMessageHandlers();
        }

        // private method: set default handler for some messages
        _setDefaultMessageHandlers() {
            for (let key in defaultMessageHandlers) {
                this._setMessageHandler(key, defaultMessageHandlers[key], true);
            }
        }

        // private method: general handler setter
        _setMessageHandler(key, handler, isDefaultHandler = false) {
            if (!this.messageHandlers[key]) {
                // placeholder for default handler
                this.messageHandlers[key] = [function () {}];
            }
            // remove all message handlers if (handler === null)
            if (typeof handler !== "function") {
                // but alway keep the first one, which is the built-in handler
                this.messageHandlers[key] = this.messageHandlers[key].slice(0, 1);
            } else {
                if (isDefaultHandler) {
                    this.messageHandlers[key][0] = handler;
                } else {
                    this.messageHandlers[key].push(handler);
                }
            }
        }

        // private method: call message handlers
        _callMessageHandler(key, msg) {
            let handlers = this.messageHandlers[key] ? this.messageHandlers[key] : [];
            handlers.forEach(handler => {
                handler.call(this, msg);
            });
        }

        // private method: register request
        // when reponses to these requests arrived, promise will be fullfiled
        _registerClientRequest(request_id, resolve, reject, timeout) {
            // we use request_id to associate requests with their responses
            // each request has a request_id,
            // the reponse from host will carry the same request_id
            this.openClientRequests[request_id] = { resolve, reject, timeout };
        }

        // private method: respond to client request
        // when reponses received from dev API server,
        // this function will be called to resolve the async request promise,
        _respondClientRequest(request_id, msg) {
            // check if there's an open request of request_id that
            // is waiting for response
            let entry = this.openClientRequests[request_id];
            // if we find it, resolve it
            if (entry) {
                // delete this entry from registry
                delete this.openClientRequests[request_id];
                // clear timeout handler for this request, if any
                let { resolve, reject, timeout } = entry;
                if (timeout) {
                    clearTimeout(timeout);
                }
                // make sure we always include a session_id
                if (!msg.session_id && this.sessionId) {
                    msg.session_id = this.sessionId;
                }
                // resolve it if response is OK,
                // reject it if the host returns whatever error message
                let success = this._responseOk(msg);
                success ? resolve(msg) : reject(msg);
            }
        }

        // private methos: check if response is good or not
        _responseOk(msg) {
            return msg && apiSuccess(msg);
        }

        // private method: reject an asynchronous action immediately
        _rejectAction(message) {
            return Promise.reject({
                status: "ERROR",
                error: { message }
            });
        }

        // private methos: call host notification handlers
        _handleNotification(type, msg) {
            if (typeof type !== "string") return;
            // trigger general message handler
            this._callMessageHandler(`notification:`, msg);
            // trigger specific message handler
            this._callMessageHandler(`notification:${type}`, msg);
        }

        // private methos: call host response handlers
        _handleResponse(type, msg) {
            if (typeof type !== "string") return;
            // trigger general message handler
            this._callMessageHandler(`response:`, msg);
            // trigger specific message handler
            this._callMessageHandler(`response:${type}`, msg);
        }

        //
        //
        //  BELOW ARE USER INTERFACES
        //
        //

        // set handlers for notifications from host server
        onNotification(type, handler) {
            if (typeof type !== "string") return;
            this._setMessageHandler(`notification:${type}`, handler);
        }

        // set handlers for responses from host server
        onResponse(type, handler) {
            if (typeof type !== "string") return;
            this._setMessageHandler(`response:${type}`, handler);
        }

        // set handler for onopen event, treat it as a special message
        onConnectionOpen(handler) {
            this._setMessageHandler(`connection:open`, handler);
        }

        // set handler for onclose event, treat it as a special message
        onConnectionClose(handler) {
            this._setMessageHandler(`connection:close`, handler);
        }

        // send general message to host
        sendMessage(msg) {
            console.log("[websocket] send:", msg);
            if (!this.sessionId) return;
            msg.session_id = this.sessionId;
            msg.request_id = msg.request_id ? msg.request_id : Date.now().toString();
            this.ws.send(JSON.stringify(msg));
        }

        // send general message to host, and
        // expecting a response
        sendRequest(msg, timeout = null) {
            if (!this.sessionId || !msg || !msg.request) {
                return this._rejectAction("invalid session or invalid request");
            }
            let { request } = msg;

            // current request timestamp. used a trick to avoid using same timestamp for multiple requests
            let requestTimestamp = Date.now();
            if (requestTimestamp <= this.lastRequestTimestamp) {
                requestTimestamp = this.lastRequestTimestamp + 1;
            }
            this.lastRequestTimestamp = requestTimestamp;

            // if request_id not provided, auto assign one, based on request timestamp
            msg.request_id = msg.request_id ? msg.request_id : requestTimestamp.toString();

            // return a promise which will be resolved when reponse receiced from host
            return new Promise((resolve, reject) => {
                // set timeout if desired
                if (typeof timeout === "number" && timeout) {
                    timeout = setTimeout(() => {
                        // reject the request
                        // will be ignored if the request have already been resolved
                        this._respondClientRequest(request, {
                            status: "ERROR",
                            error: { message: "timed out" }
                        });
                    }, timeout);
                }
                // register the request, so that
                // we can wait for it's response
                this._registerClientRequest(msg.request_id, resolve, reject, timeout);
                // send out the request message to host
                this.sendMessage(msg);
            });
        }

        // start B3d4 websocket API connection
        connect(host) {
            if (typeof host === "string") this.host = host;

            // reject current connection request, if not resolved yet
            this._respondClientRequest("connect", {
                status: "ERROR",
                error: { message: "reset by new connect request" }
            });

            // start websocket session
            this.ws = new WebSocket(this.host);

            // treat onopen as a special message
            this.ws.onopen = event => {
                this._callMessageHandler(`connection:open`, event);
            };

            // treat onclose as a special message
            this.ws.onclose = event => {
                this._callMessageHandler(`connection:close`, event);
            };

            // main websocket message handler
            // this function will dispatch messages to user defined handlers
            // registered in this.messageHandlers
            this.ws.onmessage = e => {
                let msg = e.data;
                console.log("[websocket] receive:", msg);
                // need to check the type of message
                // we may receive two types of messages from the host server,
                // (1) a gltf frame,  OR (2) a serialized json string

                // it's a gltf frame
                if (typeof msg === "object") {
                    gltfutils.parseGltfBlob(msg).then(gltf => {
                        // console.log({ type: "GLTF", gltf });
                        let { request, camera, device_id, tracking } = gltf.event;
                        let frame = gltfutils.uint8ToBlog(gltf.data);
                        // tell camera snaps from bulk camera streaming frames
                        let notification = request === "stream" ? "camera_frame" : "camera_snap";
                        // push the frame to client
                        this._handleNotification(notification, {
                            notification,
                            camera,
                            device_id,
                            tracking,
                            frame
                        });
                    });
                }

                // it's a string, expecting a valid json string
                else {
                    msg = JSON.parse(msg);
                    // console.log({ type: "JSON", msg });
                    // see if the message is a response for a previous request
                    if (msg.response_to) {
                        // resolve the promise (if any) from the request associated with this response
                        this._respondClientRequest(msg.request_id, msg);
                        // api user may also registered other handlers for this response
                        // call these message handlers, if applicable
                        this._handleResponse(msg.response_to, msg);
                    }
                    // or the message is a host notification
                    else if (msg.notification) {
                        this._handleNotification(msg.notification, msg);
                    }
                }
            };

            // return a promise, it won't resolve until
            // the server response a 'connect' message with a session_id in it
            return new Promise((resolve, reject) => {
                this._registerClientRequest("connect", resolve, reject);
            });
        }

        // clear current status and restart websocket connection
        reconnect() {
            if (!this.host) {
                return this._rejectAction("invalid host");
            }
            // reset session
            if (this.ws) {
                this.ws.close();
            }
            // clear current status
            this.sessionId = null;
            this.stationList = null;
            this.currentStation = null;
            this.openClientRequests = {};
            return this.connect();
        }

        // send 'session_init' request, return a promise
        sessionInit(credentials, timeout = null) {
            return this.sendRequest(
                Object.assign(
                    {
                        request: "session_init"
                    },
                    credentials
                ),
                timeout
            );
        }

        // send 'session_term' request, return a promise
        sessionTerm(timeout = null) {
            return this.sendRequest(
                Object.assign({
                    request: "session_term"
                }),
                timeout
            );
        }

        // send 'client_information' request, return a promise
        clientInformation(timeout = null) {
            return this.sendRequest(
                {
                    request: "client_information"
                },
                timeout
            );
        }

        // send 'token_transactions' request, return a promise
        tokenTransactions(timeout = null) {
            return this.sendRequest(
                {
                    request: "token_transactions"
                },
                timeout
            );
        }

        // send 'premium_features_enable' request, return a promise
        premiumFeaturesEnable(timeout = null) {
            return this.sendRequest(
                {
                    request: "premium_features_enable"
                },
                timeout
            );
        }

        // send 'station_list' request, return a promise
        stationList(timeout = null) {
            return this.sendRequest(
                {
                    request: "station_list"
                },
                timeout
            );
        }

        // send 'station_select' request, return a promise
        stationSelect(stationId, timeout = null) {
            if (typeof stationId !== "string") {
                return this._rejectAction("invalid station id");
            }
            return this.sendRequest(
                {
                    request: "station_select",
                    station_id: stationId
                },
                timeout
            );
        }

        // send 'station_set_default' request, return a promise
        stationSetDefault(stationId, timeout) {
            return this.sendRequest(
                {
                    request: "station_set_default",
                    station_id: stationId
                },
                timeout
            );
        }

        // send 'station_release' request, return a promise
        stationRelease(stationId, timeout = null) {
            if (typeof stationId !== "string") {
                return this._rejectAction("invalid station id");
            }
            return this.sendRequest(
                {
                    request: "station_release",
                    station_id: stationId
                },
                timeout
            );
        }

        // send 'station_current' request, return a promise
        stationCurrent(timeout = null) {
            return this.sendRequest(
                {
                    request: "station_current"
                },
                timeout
            );
        }

        // send 'station_start' request, return a promise
        stationStart(restart_cameras = false, timeout = null) {
            return this.sendRequest(
                {
                    request: "station_start",
                    restart_cameras
                },
                timeout
            );
        }

        // send 'station_start' request, return a promise
        stationStop(timeout = null) {
            return this.sendRequest(
                {
                    request: "station_stop"
                },
                timeout
            );
        }

        // send 'preview_start' request, return a promise
        previewStart(camera = "c", tracking = ["FACE"], timeout = null) {
            return this.sendRequest(
                {
                    request: "preview_start",
                    source: "COLOR",
                    format: "JPEG",
                    dimension: "480x640",
                    camera,
                    frames: 0,
                    request_fps: 10,
                    tracking,
                    stats: ["COLOR"]
                },
                timeout
            );
        }

        // send 'preview_stop' request, return a promise
        previewStop(camera = "c", timeout = null) {
            return this.sendRequest(
                {
                    request: "preview_stop",
                    camera
                },
                timeout
            );
        }

        // send 'scan_record' request, return a promise
        scanRecord(scanMode = "FACE", timeout = null) {
            return this.sendRequest(
                {
                    request: "scan_record",
                    scan_mode: scanMode
                },
                timeout
            );
        }

        // send 'scan_process' request, return a promise
        scanProcess(scanId, dentalBitePlate = null, timeout = null) {
            if (typeof scanId !== "string") {
                return this._rejectAction("invalid scan id");
            }
            return this.sendRequest(
                {
                    request: "scan_process",
                    scan_id: scanId,
                    type: "HEADMODEL",
                    dental_bite_plate: dentalBitePlate
                },
                timeout
            );
        }

        // send 'release_scan' request, return a promise
        scanRelease(scanId, timeout = null) {
            if (typeof scanId !== "string") {
                return this._rejectAction("invalid scan id");
            }
            return this.sendRequest(
                {
                    request: "scan_release",
                    scan_id: scanId
                },
                timeout
            );
        }

        // send 'camera_status' request, return a promise
        cameraStatus(timeout = null) {
            return this.sendRequest(
                {
                    request: "camera_status"
                },
                timeout
            );
        }

        // send 'camera_snap' request, return a promise
        cameraSnap(camera, deviceId = null, timeout = null) {
            return this.sendRequest(
                {
                    request: "camera_snap",
                    device_id: deviceId,
                    camera
                },
                timeout
            );
        }

        // send "upload_model", return a promise
        modelUpload(scanId, modelName, userEmail, timeout = null) {
            return this.sendRequest(
                {
                    request: "model_upload",
                    scan_id: scanId,
                    model_name: modelName,
                    user_email: userEmail
                },
                timeout
            );
        }

        // send "delete_model", return a promise
        modelDelete(modelId, timeout = null) {
            return this.sendRequest(
                {
                    request: "model_delete",
                    model_id: modelId
                },
                timeout
            );
        }

        // send "model_export", return a promise
        modelExport(modelId, format, path, timeout = null) {
            return this.sendRequest(
                {
                    request: "model_export",
                    model_id: modelId,
                    format,
                    path
                },
                timeout
            );
        }

        // send "model_save", return a promise
        modelSave(
            scanId,
            path,
            filename = "headscan",
            format = "obj",
            resolution = "SD",
            smoothing = false,
            watertight = false,
            faceLandmark = false,
            earLandmark = false,
            modelOrientation = null,
            timeout = null
        ) {
            return this.sendRequest(
                {
                    request: "model_save",
                    scan_id: scanId,
                    path,
                    filename,
                    format,
                    resolution,
                    smoothing,
                    watertight,
                    face_landmark: faceLandmark,
                    ear_landmark: earLandmark,
                    model_orientation: modelOrientation
                },
                timeout
            );
        }

        // send "dental_bite_plate_list", return a promise
        dentalBitePlateList(timeout = null) {
            return this.sendRequest(
                {
                    request: "dental_bite_plate_list"
                },
                timeout
            );
        }

        // send "hostlog_upload", return a promise
        hostlogUpload(username, message = null, timeout = null) {
            return this.sendRequest(
                {
                    request: "hostlog_upload",
                    username,
                    message
                },
                timeout
            );
        }

        //
        //
        // station-configure apis
        //
        //

        // send "camera_list", return a promise
        cameraList(timeout = null) {
            return this.sendRequest(
                {
                    request: "camera_list"
                },
                timeout
            );
        }

        // send "station_configure_start", return a promise
        stationConfigureStart(cameras, timeout = null) {
            return this.sendRequest(
                {
                    request: "station_configure_start",
                    cameras
                },
                timeout
            );
        }

        // send "station_configure_finish", return a promise
        stationConfigureFinish(name, layout, positions, rotations = null, timeout = null) {
            return this.sendRequest(
                {
                    request: "station_configure_finish",
                    name,
                    layout,
                    positions,
                    rotations
                },
                timeout
            );
        }

        // send "camera_update" request, return a promise
        cameraUpdate(timeout = null) {
            return this.sendRequest(
                {
                    request: "camera_update"
                },
                timeout
            );
        }

        //
        //
        // camera-registration apis
        //
        //

        // send "camera_registration_query", return a promise
        cameraRegistrationQuery(deviceId, timeout = null) {
            return this.sendRequest(
                {
                    request: "camera_registration_query",
                    device_id: deviceId
                },
                timeout
            );
        }

        // send "camera_registration_add", return a promise
        cameraRegistrationAdd(deviceId, timeout = null) {
            return this.sendRequest(
                {
                    request: "camera_registration_add",
                    device_id: deviceId
                },
                timeout
            );
        }
    }

    // export this module
    return B3d4api;
});
