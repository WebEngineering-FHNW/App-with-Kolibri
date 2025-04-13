/**
 * @module remote/remoteObservableConstants
 * Values that must be the same on client and server.
 */

/**
 * Url path entry for registering the SSE channel that provides the service of remote observables.
 * We currently use only one topic since the amount of parallel SSE channels from the same
 * client is limited (6 with http/1, 100 with http/2).
 */
export const TOPIC               = "remoteObservable";

/** request parameter that contains the id of the observable */
export const OBSERVABLE_ID_PARAM = "id";

/** url path entry for the action that sets the value of a remote observable */
export const UPDATE_ACTION_NAME  = "setValue";
/** request and response parameter that contains the value for the update */
export const UPDATE_ACTION_PARAM = "value";

/** url path entry for the action that reads the value of a remote observable */
export const READ_ACTION_NAME    = "getValue";
/** response parameter that contains the value being read */
export const READ_ACTION_PARAM   = "value";

