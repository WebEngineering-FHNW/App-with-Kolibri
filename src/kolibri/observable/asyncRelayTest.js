// noinspection DuplicatedCode

import {AsyncRelay}     from "./asyncRelay.js"
import {asyncTest}      from "../util/test.js";
import {ObservableMap}  from "./observableMap.js";
import {Scheduler}      from "../dataflow/dataflow.js";


asyncTest("asyncRelay set/get", assert => {

    const observableMap  = ObservableMap("observableMap");
    const remoteObservableMap = ObservableMap("remoteObservableMap");

    const scheduler = AsyncRelay(remoteObservableMap)(observableMap);

    const valueA = Object("A");
    const valueB = Object("B");

    scheduler.addOk( _=> {
        observableMap.setValue("a", valueA); // setting the value on om1 should relay it to remoteObservableMap
    });
    scheduler.addOk( _=> {
        remoteObservableMap.getValue("a")
           (_=> assert.isTrue(false))
           (v=> assert.is(v,valueA));
    });

    scheduler.addOk( _=> {
        remoteObservableMap.setValue("a",valueB); // and vice versa
    });
    scheduler.addOk( _=> {
        observableMap.getValue("a")
           (_=> assert.isTrue(false))
           (v=> assert.is(v,valueB));
    });

    return new Promise( done => {
        scheduler.addOk( _ => done());
    });

});

asyncTest("asyncRelay onChange observableMap", assert => {

    const observableMap  = ObservableMap("observableMap");
    const remoteObservableMap = ObservableMap("remoteObservableMap");

    const omChanges = [];
    const romChanges = [];

    assert.iterableEq(omChanges, romChanges);

    const scheduler = AsyncRelay(remoteObservableMap)(observableMap);

    observableMap.onChange( (key, value) => omChanges.push(`${key} ${value}`));

    const valueA = Object("A");
    const valueB = Object("B");

    scheduler.addOk( _=> {
        observableMap.setValue("a", valueA);
    });
    scheduler.addOk( _=> {
        // we add the listener late, such that the first update
        // has already gone through. Still, everything has to be in sync.
        remoteObservableMap.onChange( (key, value) => romChanges.push(`${key} ${value}`));
    });
    scheduler.addOk( _=> {
        assert.iterableEq(omChanges, romChanges);
    });

    return new Promise( done => {
        // change value through observableMap
        scheduler.addOk( _=> {
            observableMap.setValue("a", valueB);
            scheduler.addOk( _=> {
                    assert.iterableEq(omChanges, romChanges);
                    done();
                });
        });
    });

});
asyncTest("asyncRelay onChange remoteObservableMap", assert => {

    const observableMap  = ObservableMap("observableMap");
    const remoteObservableMap = ObservableMap("remoteObservableMap");

    const omChanges = [];
    const romChanges = [];

    assert.iterableEq(omChanges, romChanges);

    const scheduler = AsyncRelay(remoteObservableMap)(observableMap);

    observableMap.onChange( (key, value) => omChanges.push(`${key} ${value}`));

    const valueA = Object("A");
    const valueB = Object("B");

    scheduler.addOk( _=> {
        observableMap.setValue("a",valueA);
    });
    scheduler.addOk( _=> {
        // we add the listener late, such that the first update
        // has already gone through. Still, everything has to be in sync.
        remoteObservableMap.onChange( (key, value) => romChanges.push(`${key} ${value}`));
    });
    scheduler.addOk( _=> {
        assert.iterableEq(omChanges, romChanges);
    });

    return new Promise( done => {    // change value through remoteObservableMap
        scheduler.addOk(_ => {
            remoteObservableMap.setValue("a", valueB);
            scheduler.addOk(_ => {
                assert.iterableEq(omChanges, romChanges);
                done();
            });

        });
    });

});

asyncTest("asyncRelay observableMap set value once", assert => {

    const observableMap  = ObservableMap("observableMap");
    const remoteObservableMap = ObservableMap("remoteObservableMap");

    const omChanges = [];
    const romChanges = [];

    const scheduler = AsyncRelay(remoteObservableMap)(observableMap);

    observableMap .onChange( (key, value) => omChanges .push(`${key} ${value}`));
    remoteObservableMap.onChange( (key, value) => romChanges.push(`${key} ${value}`));

    assert.is(omChanges .length, 0);
    assert.is(romChanges.length, 0);

    observableMap.setValue("a",Object("A"));

    return new Promise( done => {
        scheduler.addOk( _=> {
            assert.is(omChanges .length, 1);
            assert.is(romChanges.length, 1);
            done();
        });
    });
});

asyncTest("asyncRelay observableMap set value three times from same work package", assert => {

    const observableMap  = ObservableMap("observableMap");
    const remoteObservableMap = ObservableMap("remoteObservableMap");

    const omChanges  = [];
    const romChanges = [];

    const scheduler = AsyncRelay(remoteObservableMap)(observableMap);

    observableMap .onChange( (key, value) => omChanges .push(`${key} ${value}`));
    remoteObservableMap.onChange( (key, value) => romChanges.push(`${key} ${value}`));

    assert.is(omChanges .length, 0);
    assert.is(romChanges.length, 0);

    observableMap.setValue("a",Object("A1")); // add
    observableMap.setValue("a",Object("A2")); // then change two times before async remoteObservableMap can update
    observableMap.setValue("a",Object("A3"));

    assert.is(omChanges .length, 3); // om1 is immediately updated

    return new Promise( done => {
        scheduler.addOk( _=> {
            assert.is(romChanges.length, 3); // remoteObservableMap is asynchronously updated
            done();
        });
    });
});


asyncTest("asyncRelay om1 - remoteObservableMap - om2", assert => {

    const om1 = ObservableMap("om1");
    const om2 = ObservableMap("om2");
    const remoteObservableMap = ObservableMap("remoteObservableMap");

    const om1Changes = [];
    const om2Changes = [];
    const romChanges = [];

    // This scenario works fine when all access to the OMs is sequenced through
    // an overarching scheduler

    const testScheduler = Scheduler();
    AsyncRelay(remoteObservableMap)(om1);
    AsyncRelay(remoteObservableMap)(om2);

    om1.onChange( (key, value) => om1Changes.push(`${key} ${value}`));
    om2.onChange( (key, value) => om2Changes.push(`${key} ${value}`));
    remoteObservableMap.onChange( (key, value) => romChanges.push(`${key} ${value}`));

    testScheduler.addOk( _ => {
        om1.setValue("a",Object("A1")); // add
        assert.is(om1Changes .length, 1);
    });
    testScheduler.addOk( _ => {
        assert.is(romChanges.length, 1); // remoteObservableMap was asynchronously updated
        assert.is(om2Changes.length, 1); // and so was om2
    });

    testScheduler.addOk( _ => {
        om1.setValue("a",Object("A2")); // change value
        assert.is(om1Changes .length, 2);
    });
    testScheduler.addOk( _ => {
        assert.is(romChanges.length, 2);
        assert.is(om2Changes.length, 2);
    });

    testScheduler.addOk( _ => {
        om2.setValue("a", Object("A3"));     // now change through om2
        assert.is(om2Changes .length, 3);
    });
    testScheduler.addOk( _ => {
        assert.is(romChanges.length, 3);
        assert.is(om1Changes.length, 3);
        assert.is(om2Changes.length, 3);
    });

    testScheduler.addOk( _ => {
        remoteObservableMap.setValue("a", Object("A4"));     // now change through remoteObservableMap
        assert.is(romChanges .length, 4);
    });
    testScheduler.addOk( _ => {
        assert.is(romChanges.length, 4);
        assert.is(om1Changes.length, 4);
        assert.is(om2Changes.length, 4);
    });

    return new Promise( done => { // scheduler must be done
        testScheduler.addOk( _=> {
           done();
        });
    });
});

asyncTest("asyncRelay om1 - om2 - change in same action", assert => {

    // while this scenario works, it is better to have separate actions
    // for updates from separate maps because it is clearer at which point in time
    // the values will be in sync.
    // Note that only changes through the OMs are guaranteed, not directly on ROM!

    const om1 = ObservableMap("om1");
    const om2 = ObservableMap("om2");
    const remoteObservableMap = ObservableMap("remoteObservableMap");

    const om1Changes = [];
    const om2Changes = [];
    const romChanges = [];

    // This scenario works fine when all access to the OMs is sequenced through
    // an overarching scheduler

    const testScheduler = Scheduler();
    AsyncRelay(remoteObservableMap)(om1);
    AsyncRelay(remoteObservableMap)(om2);

    om1.onChange( (key, value) => om1Changes.push(`${key} ${value}`));
    om2.onChange( (key, value) => om2Changes.push(`${key} ${value}`));
    remoteObservableMap.onChange( (key, value) => romChanges.push(`${key} ${value}`));

    testScheduler.addOk( _ => {
        om1.setValue("a",Object("A1"));    // add
        om2.setValue("a",Object("A2"));    // add
        assert.is(om1Changes.length, 1);
        assert.is(om2Changes.length, 2);   // interesting that om2 sees both changes right here
        assert.is(romChanges.length, 1);   // while remoteObservableMap has only seen the first one (?)
    });
    // this action comes a bit too early, the update actions are behind us in the queue
    testScheduler.addOk( _ => {
        assert.is(om1Changes.length, 1);   // the A2 update is missing
        assert.is(om2Changes.length, 2);
        assert.is(romChanges.length, 1);   // the A2 update is missing
    });
    // now we're talking
    testScheduler.addOk( _ => {
        assert.is(om1Changes.length, 2);   // it comes eventually
        assert.is(om2Changes.length, 2);
        assert.is(romChanges.length, 2);   // it comes eventually
    });

    return new Promise( done => { // both schedulers must be done
        testScheduler.addOk( _=> {
           done();
        });
    });
});

asyncTest("asyncRelay many maps synced", assert => {

    const mapCount = 20;
    const oms = mapCount.times( n => ObservableMap(`om${n}`));
    const remoteObservableMap = ObservableMap("remoteObservableMap");

    const omsChanges = mapCount.times( _ => []);
    const romChanges = [];

    // This scenario works fine when all access to the OMs is sequenced through
    // an overarching scheduler

    const testScheduler = Scheduler();
    mapCount.times( n => {
        AsyncRelay(remoteObservableMap)(oms[n]);
        oms[n].onChange( (key, value) => omsChanges[n].push(`${key} ${value}`));
    });
    remoteObservableMap.onChange( (key, value) => romChanges.push(`${key} ${value}`));

    testScheduler.addOk( _ => {
        oms[0].setValue("a","A0");
        assert.is(omsChanges[0].length, 1); // local effect immediately visible
    });

    testScheduler.addOk( _ => {           // note: this doesn't need scheduler1 because we are added after the s1 tasks
        assert.is(romChanges.length, 1); // remoteObservableMap was asynchronously updated
        mapCount.times( n => {
            assert.is(omsChanges[n].length, 1); // and so were all other oms
        });
    });

    mapCount.times( n => {
        if (n===0) return; // we covered this above
        testScheduler.addOk( _ => {
            oms[n].setValue("a",Object("A"+n));
            assert.is(omsChanges[n].length, n+1);
        });
        testScheduler.addOk( _ => {
            assert.is(romChanges.length, n+1);
            mapCount.times( i => {
                assert.is(omsChanges[i].length, n+1);
            });
        });
    });

    return new Promise( done => { // both schedulers must be done
        testScheduler.addOk( _=> {
           done();
        });
    });
});
