
import {clientId}               from "../../kolibri/version.js";
import {RemoteObservableClient} from "../../server/S7-manyObs-SSE/remoteObservableClient.js";

export { ProductionRemoteObservableFactory };


/** @private */
let runningId = 0;

/**
 * @private
 * @return NamedObservableCoordinatorType
 */
const ProductionRemoteObservableFactoryImpl = (baseUrl, topicName, projectionCallback)  => {
    const remoteObservableClient = RemoteObservableClient(baseUrl, topicName, projectionCallback);
    return {
        addObservableForID    : id => remoteObservableClient.addObservableForID(`${id}-${runningId++}-${clientId}`),
        removeObservableForID : id => remoteObservableClient.removeObservableForID(id)
    }
};

/**
 * @constructor
 *
 * @param { String } baseUrl   - start of a URL: protocol, server, port, base path without trailing slashes
 * @param { String } topicName - must be the same on client and server
 *
 * @return NamedObservableCoordinatorFactoryType
 */
const ProductionRemoteObservableFactory = (baseUrl, topicName)  => {
    return {
        Coordinator: projectionCallback => ProductionRemoteObservableFactoryImpl(baseUrl, topicName, projectionCallback)
    }
};
