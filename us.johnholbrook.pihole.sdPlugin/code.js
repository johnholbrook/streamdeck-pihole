var websocket = null;
var instances = {}

// send some data over the websocket
function send(data){
    websocket.send(JSON.stringify(data));
}

// write to the log
function log(message){
    send({
        "event": "logMessage",
        "payload": {
            "message": message
        }
    });
}

// make a call to enable or disable pi-hole
function callPiHole(settings, cmd){
    let req_addr = `http://${settings.ph_addr}/admin/api.php?${cmd}&auth=${settings.ph_key}`;
    let xhr = new XMLHttpRequest();
    xhr.open("GET", req_addr);
    xhr.send();
}

// get the status of the pi-hole (enabled/disabled, stats, etc.) and pass to a handler function
function get_ph_status(settings, handler){
    let req_addr = `http://${settings.ph_addr}/admin/api.php`;
    // log(`request to ${req_addr}`);
    let xhr = new XMLHttpRequest();
    xhr.open("GET", req_addr);
    xhr.onload = function(){
        data = JSON.parse(xhr.response);
        handler(data);
    }
    xhr.onerror = function(){
        handler({"error": "couldn't reach Pi-hole"});
    }
    xhr.send();
}

// event handler for us.johnholbrook.pihole.temporarily-disable
function temporarily_disable(context){
    let settings = instances[context].settings;
    get_ph_status(settings, response => {
        if (response.status == "enabled"){  // it only makes sense to temporarily disable p-h if it's currently enabled
            // stop the poller from changing the state while p-h is temporarily disabled
            instances[context].settings.show_status = false;
            // disable p-h
            callPiHole(settings, "disable");
            // set disabled state on button
            setState(context, 1);

            // after the appropriate amount of time, re-enable p-h
            let interval = Number(settings.disable_time);
            setTimeout(() => {
                callPiHole(settings, "enable");
                setState(context, 0);
                instances[context].settings.show_status = true;
            }, interval * 1000);
        }
    });
}

// event handler for us.johnholbrook.pihole.toggle
function toggle(context){
    let settings = instances[context].settings;
    get_ph_status(settings, response => {
        if (response.status == "disabled"){
            callPiHole(settings, "enable");
            setState(context, 0);
        }
        else if (response.status == "enabled"){
            callPiHole(settings, "disable");
            setState(context, 1);
        }
    });
}

// poll p-h and set the state and button text appropriately
// (called once per second per instance)
function pollPihole(context){
    let settings = instances[context].settings;
    get_ph_status(settings, response => {
        if ("error" in response){ // couldn't reach p-h, display a warning
            // log(`${instances[context].action} error`)
            send({
                "event": "showAlert",
                "context": context
            });
        }
        else{
            // set state according to whether p-h is enabled or disabled
            if (response.status == "disabled" && settings.show_status){
                // log(`${instances[context].action} offline`);
                setState(context, 1);
            }
            else if (response.status == "enabled" && settings.show_status){
                // log(`${instances[context].action} online`);
                setState(context, 0);
            }

            // display stat, if desired
            if (settings.stat != "none"){
                // let stat = String(response[settings.stat]);
                let stat = process_stat(response[settings.stat], settings.stat);
                // log(stat);
                send({
                    "event": "setTitle",
                    "context": context,
                    "payload": {
                        "title": stat
                    }
                });
            }
        }
    });
}

// process the pi-hole stats to make them more human-readable,
// then cast to string
function process_stat(value, type){
    if (type == "ads_percentage_today"){
        return value.toFixed(2) + "%";
    }
    else{
        return String(value) + ""
    }
}

// change the state of a button (param "state" should be either 0 or 1)
function setState(context, state){
    let json = {
        "event" : "setState",
        "context" : context,
        "payload" : {
            "state" : state
        }
    };
    websocket.send(JSON.stringify(json));
}

// update the p-h address, API key, or disable time
function updateSettings(payload){
    if ("disable_time" in payload){
        time = payload.disable_time;
    }
    if ("ph_key" in payload){
        ph_key = payload.ph_key;
    }
    if ("ph_addr" in payload){
        ph_addr = payload.ph_addr;
    }
}

// write settings
function writeSettings(context, action, settings){
    // write the settings
    if (!(context in instances)){ 
        instances[context] = {"action": action};
    }
    instances[context].settings = settings;
    if (instances[context].settings.ph_addr == ""){
        instances[context].settings.ph_addr = "pi.hole";
    }

    // poll p-h to get status
    if ("poller" in instances[context]){
        clearInterval(instances[context].poller);
    }
    instances[context].settings.show_status = true;
    instances[context].poller = setInterval(pollPihole, 5000, context);
    log(JSON.stringify(instances));
}

// called by the stream deck software when the plugin is initialized
function connectElgatoStreamDeckSocket(inPort, inPluginUUID, inRegisterEvent, inInfo){
    // create the websocket
    websocket = new WebSocket("ws://localhost:" + inPort);
    websocket.onopen = function(){
        // WebSocket is connected, register the plugin
        var json = {
            "event": inRegisterEvent,
            "uuid": inPluginUUID
        };
        websocket.send(JSON.stringify(json));
    };

    // message handler
    websocket.onmessage = function(evt){
        let jsonObj = JSON.parse(evt.data);
        let event = jsonObj.event;
        let action = jsonObj.action;
        let context = jsonObj.context;

        log(`${action} ${event}`);

        // update settings for this instance
        if (event == "didReceiveSettings"){
            writeSettings(context, action, jsonObj.payload.settings);
        }

        // apply settings when the action appears
        else if (event == "willAppear"){
            writeSettings(context, action, jsonObj.payload.settings);
        }

        // stop polling and delete settings when the action disappears
        else if (event == "willDisappear"){
            if ("poller" in instances[context]){
                clearInterval(instances[context].poller);
            }
            delete instances[context];
        }

        // handle a keypress
        else if (event == "keyUp"){
            if (action == "us.johnholbrook.pihole.toggle"){
                toggle(context);
            }
            else if (action == "us.johnholbrook.pihole.temporarily-disable"){
                temporarily_disable(context);
            }
        }
    }
}