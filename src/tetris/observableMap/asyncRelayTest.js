import {asyncTest}  from "../../kolibri/util/test.js";
import {OM}         from "./om.js";
import {AsyncRelay} from "./asyncRelay.js"


asyncTest("asyncRelay", assert => {

    const om  = OM("om");
    const rom = OM("rom");

    const scheduler = AsyncRelay(rom)(om);

    scheduler.addOk( _=> {
        om.setValue("a","A"); // setting the value on om should relay it to rom
    });
    scheduler.addOk( _=> {
        rom.getValue("a")
           (_=> assert.isTrue(false))
           (v=>assert.is(v,"A"));
    });

    scheduler.addOk( _=> {
        console.warn("--------");
        rom.setValue("a","B"); // and vice versa
    });
    scheduler.addOk( _=> {
        om.getValue("a")
           (_=> assert.isTrue(false))
           (v=>assert.is(v,"B"));
    });

    return new Promise( done => {
        scheduler.addOk( _ => done());
    });



});
