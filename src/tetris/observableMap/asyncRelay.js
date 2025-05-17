import {Scheduler} from "../../kolibri/dataflow/dataflow.js";

export {AsyncRelay}

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
            console.warn("om onChange", key, value);
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
        console.warn("rom onChange", key, value);
        om.setValue(key, value);
    });

    return romScheduler;
};
