import {Scheduler} from "../../kolibri/dataflow/dataflow.js";
import {LoggerFactory} from "../../kolibri/logger/loggerFactory.js";

export {AsyncRelay}

const log = LoggerFactory("ch.fhnw.kolibri.observable.asyncRelay");

/**
 * @typedef { (rom:OMType) => (om:OMType) => SchedulerType } AsyncRelayType
 * Connecting a remote observable map (rom) with another observable map (om) such that
 * value changes from either side are synchronized with the other side.
 * The remote observable map is supposed to work in an asynchronous fashion, which means that
 * all function calls need to happen under the control of a {@link SchedulerType scheduler}
 * in order to ensure proper sequencing.
 */

/**
 * @type { AsyncRelayType }
 * @see {@link AsyncRelayType}
 * */
const AsyncRelay = rom => om => {

    // only access to the (async) rom is scheduled
    const romScheduler = Scheduler();

    // whenever om changes, tell rom
    om.onKeyAdded( key => {
        romScheduler.addOk( _=> {
            om.getValue(key)
              (_=> rom.removeKey(key))
              (v=> rom.setValue(key, v))
        } );
    });
    om.onKeyRemoved( key => {
        romScheduler.addOk( _=> {rom.removeKey(key)} );
    });
    om.onChange( (key, value) => {
        romScheduler.addOk( _=> {
            log.debug(`relay: om onchange key ${key} value ${value}`);
            rom.setValue(key, value)
        } );
    });

    // whenever rom changes, update om
    rom.onKeyAdded( key => {
            rom.getValue(key)
              (_=> om.removeKey(key))
              (v=> om.setValue(key, v))
    });
    rom.onKeyRemoved( key => {
            om.removeKey(key)
    });
    rom.onChange((key, value) => {
        log.debug(`relay: rom onchange key ${key} value ${value}`);
        om.setValue(key, value);
    });

    return romScheduler;
};
