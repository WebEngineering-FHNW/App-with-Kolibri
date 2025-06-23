import {asyncTest}  from "../../kolibri/util/test.js";
import {OM}         from "./om.js";
import {AsyncRelay} from "./asyncRelay.js"


asyncTest("asyncRelay set/get", assert => {

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

asyncTest("asyncRelay onChange om", assert => {

    const om  = OM("om");
    const rom = OM("rom");

    const omChanges = [];
    const romChanges = [];

    assert.iterableEq(omChanges, romChanges);

    const scheduler = AsyncRelay(rom)(om);

    om.onChange( (key, value) => omChanges.push(`${key} ${value}`));

    scheduler.addOk( _=> {
        om.setValue("a","A");
    });
    scheduler.addOk( _=> {
        // we add the listener late, such that the first update
        // has already gone through. Still, everything has to be in sync.
        rom.onChange( (key, value) => romChanges.push(`${key} ${value}`));
    });
    scheduler.addOk( _=> {
        assert.iterableEq(omChanges, romChanges);
    });

    return new Promise( done => {
        // change value through om
        scheduler.addOk( _=> {
            om.setValue("a","B");
            scheduler.addOk( _=> {
                    assert.iterableEq(omChanges, romChanges);
                    done();
                });
        });
    });

});
asyncTest("asyncRelay onChange rom", assert => {

    const om  = OM("om");
    const rom = OM("rom");

    const omChanges = [];
    const romChanges = [];

    assert.iterableEq(omChanges, romChanges);

    const scheduler = AsyncRelay(rom)(om);

    om.onChange( (key, value) => omChanges.push(`${key} ${value}`));

    scheduler.addOk( _=> {
        om.setValue("a","A");
    });
    scheduler.addOk( _=> {
        // we add the listener late, such that the first update
        // has already gone through. Still, everything has to be in sync.
        rom.onChange( (key, value) => romChanges.push(`${key} ${value}`));
    });
    scheduler.addOk( _=> {
        assert.iterableEq(omChanges, romChanges);
    });

    return new Promise( done => {    // change value through rom
        scheduler.addOk(_ => {
            rom.setValue("a", "B");
            scheduler.addOk(_ => {
                assert.iterableEq(omChanges, romChanges);
                done();
            });

        });
    });

});
