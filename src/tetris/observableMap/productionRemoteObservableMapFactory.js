
import {RemoteObservableClient} from "../../server/S7-manyObs-SSE/remoteObservableClient.js";

export { ProductionRemoteObservableMapFactory };


/**
 * @private
 * @return ProducerType<ObservableMapType>
 */
const ProductionRemoteObservableMapFactoryImpl = (baseUrl, topicName) => newNameCallback  => {
    const remoteObservableClient = RemoteObservableClient(baseUrl, topicName, newNameCallback);
    return {
        addObservableForID    : remoteObservableClient.addObservableForID,
        removeObservableForID : remoteObservableClient.removeObservableForID
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
const ProductionRemoteObservableMapFactory = (baseUrl, topicName)  => {
    return {
        newMap: ProductionRemoteObservableMapFactoryImpl(baseUrl, topicName)
    }
};
