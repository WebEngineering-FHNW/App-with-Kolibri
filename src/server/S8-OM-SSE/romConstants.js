/**
 * @module remote/romConstants
 * Values that must be the same on client and server.
 */

/**
 * Url path entry for registering the SSE channel that provides the service of remote observables.
 * We currently use only one topic since the number of parallel SSE channels from the same
 * client is limited (6 with http/1, 100 with http/2).
 */
export const PATH_REMOTE_OBSERVABLE = "remoteObservable";

/** url path entry for the action that sets the value of a remote observable */
export const PATH_UPDATE_ACTION = "setValue";
/** url path entry for the action that removes the remote observable with
 * key {@link PARAM_KEY} from the map of stored key/values */
export const PATH_REMOVE_ACTION = "remove";

/** request parameter that contains the id of the observable */
export const PARAM_KEY = "key";
/** request and response parameter that contains the value for an update */
export const PARAM_UPDATE_ACTION = "value";

/*
 * Keys in the transferred object (DTO) that client and server have to agree upon
 */

export const KEY_ACTION  = "action";
export const KEY_PAYLOAD = "payload";
export const KEY_DATA    = "data";
export const KEY_VERSION = "version";
export const KEY_ORIGIN  = "origin";
