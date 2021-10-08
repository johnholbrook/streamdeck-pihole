var websocket = null;
var action = null;
var context = null;

// send some data over the websocket
function send(data){
    websocket.send(JSON.stringify(data));
}

// write to the log
function log(message){
    alert("logging!")
    send({
        "event": "logMessage",
        "payload": {
            "message": message
        }
    });
}

// called by the stream deck software when the PI is inizialized
function connectElgatoStreamDeckSocket(inPort, inPropertyInspectorUUID, inRegisterEvent, inInfo, inActionInfo){
    websocket = new WebSocket(`ws://127.0.0.1:${inPort}`);
    websocket.onopen = function(){
        send({
            "event" : inRegisterEvent,
            "uuid" : inPropertyInspectorUUID
        });
    }

    websocket.onmessage = function(evt){
        jsonObj = json.parse(evt.data);
        let event = jsonObj.event;
    }

    let actionInfo = JSON.parse(inActionInfo);
    action = actionInfo.action;
    context = inPropertyInspectorUUID;

    // hide the "disable time" input for the toggle action
    if (action == "us.johnholbrook.pihole.toggle"){
        document.querySelector("#disable-time").style.display = "none";
    }

    // write stored settings to input boxes
    let settings = actionInfo.payload.settings;
    document.querySelector("#ph-key-input").value = settings.ph_key ? settings.ph_key : "";
    document.querySelector("#ph-addr-input").value = settings.ph_addr ? settings.ph_addr : "";
    document.querySelector("#stat-input").value = settings.stat ? settings.stat : "none";
    if (action == "us.johnholbrook.pihole.temporarily-disable"){
        document.querySelector("#disable-time-input").value = settings.disable_time ? settings.disable_time : "";
    }
}

function sendToPlugin(payload){
    send({
        "event": "sendToPlugin",
        "action": action,
        "context": context,
        "payload": payload
    });
}

function updateSettings(){
    send({
        "event": "logMessage",
        "payload": {
            "message": "Hello World!"
        }
    });
    if (action == "us.johnholbrook.pihole.toggle"){
        let key = document.querySelector("#ph-key-input").value;
        let addr = document.querySelector("#ph-addr-input").value;
        let stat = document.querySelector("#stat-input").value;
        send({
            "event" : "setSettings",
            "context" : context,
            "payload": {
                "ph_addr" : addr,
                "ph_key" : key,
                "stat" : stat
            }
        });
    }
    else if (action == "us.johnholbrook.pihole.temporarily-disable"){
        let disable_time = document.querySelector("#disable-time-input").value;
        let key = document.querySelector("#ph-key-input").value;
        let addr = document.querySelector("#ph-addr-input").value;
        let stat = document.querySelector("#stat-input").value;
        send({
            "event" : "setSettings",
            "context" : context,
            "payload": {
                "ph_addr" : addr,
                "ph_key" : key,
                "disable_time" : disable_time,
                "stat" : stat
            }
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // update settings when something is changed
    document.querySelector("#disable-time-input").onchange = updateSettings;
    document.querySelector("#ph-key-input").onchange = updateSettings;
    document.querySelector("#ph-addr-input").onchange = updateSettings;
    document.querySelector("#stat-input").onchange = updateSettings;
});