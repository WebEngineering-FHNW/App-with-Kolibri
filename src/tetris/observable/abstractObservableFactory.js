/**
 * @typedef NamedObservableCoordinatorType
 * Coordinating {@link NamedRemoteObservableType}s such that by their name, observables can be created
 * or removed such that any {@link ProjectionCallbackType}s will be notified appropriately.
 *
 * @property { ConsumerType<String> }  addObservableForID - adding a new ID will
 *  publish the newly available ID (which should be **unique**)
 *  which in turn will trigger any projections (display and binding) first locally and then remotely
 * @property { ConsumerType<String> }  removeObservableForID - publish first locally and then remotely
 * that a given id is no longer in the list of named remote observables, thus allowing all listeners to
 * clean up any local bindings and remove all other bound resources, esp. projected views.
 */

/**
 * @typedef NamedObservableCoordinatorFactoryType
 *
 * @property { (ProjectionCallbackType) => NamedObservableCoordinatorType } Coordinator -> constructor
 */
