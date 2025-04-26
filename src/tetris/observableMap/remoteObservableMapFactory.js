
import {RemoteObservableMap} from "../../server/S7-manyObs-SSE/remoteObservableMap.js";

export { RemoteObservableMapFactory };


/**
 * @private
 * @return ProducerType<ObservableMapType>
 */
const RemoteObservableMapFactoryImpl = (baseUrl, topicName) => newNameCallback  => {
    const remoteObservableMap = RemoteObservableMap(baseUrl, topicName, newNameCallback);
    return {
        addObservableForID    : remoteObservableMap.addObservableForID,
        removeObservableForID : remoteObservableMap.removeObservableForID,
        ensureAllObservableIDs : remoteObservableMap.ensureAllObservableIDs,
    }
};

/**
 * @constructor
 *
 * @param { String } baseUrl   - start of a URL: protocol, server, port, base path without trailing slashes
 * @param { String } topicName - must be the same on client and server
 *
 * @return ObservableMapFactoryType
 */
const RemoteObservableMapFactory = (baseUrl, topicName)  => {
    return {
        newMap: RemoteObservableMapFactoryImpl(baseUrl, topicName)
    }
};
