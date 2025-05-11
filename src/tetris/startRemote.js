import {TOPIC_REMOTE_OBSERVABLE} from "../server/S7-manyObs-SSE/remoteObservableConstants.js";
import {startGame}               from "./gameController.js";
import {defaultConsoleLogging}   from "../kolibri/logger/loggingSupport.js";
import {RemoteObservableMapCtor} from "../server/S7-manyObs-SSE/remoteObservableMap.js";
import {projectGame}             from "./gameProjector.js";

defaultConsoleLogging("ch.fhnw", LOG_DEBUG);


const observableMapCtor = RemoteObservableMapCtor(window.location.origin, TOPIC_REMOTE_OBSERVABLE);
startGame(observableMapCtor, gameController => {
    document.body.append(...projectGame(gameController));
});
