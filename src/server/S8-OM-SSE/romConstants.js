/**
 * @module remote/romConstants
 * Values that must be the same on client and server.
 */

/**
 * Url path entry for registering the SSE channel that provides the service of remote observables.
 * We currently use only one topic since the number of parallel SSE channels from the same
 * client is limited (6 with http/1, 100 with http/2).
 */
export const TOPIC_REMOTE_OBSERVABLE = "remoteObservable";

/** request parameter that contains the id of the observable */
export const KEY_PARAM   = "key";

export const ACTION_KEY  = "action";
export const PAYLOAD_KEY = "payload";
export const DATA_KEY    = "data";
export const VERSION_KEY = "version";

/** url path entry for the action that sets the value of a remote observable */
export const UPDATE_ACTION_NAME  = "setValue";
/** request and response parameter that contains the value for the update */
export const UPDATE_ACTION_PARAM = "value";

/** url path entry for the action that removes the remote observable with
 * key {@link KEY_PARAM} from the map of stored key/values */
export const REMOVE_ACTION_NAME    = "remove";

