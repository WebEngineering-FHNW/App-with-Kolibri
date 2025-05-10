import {TestSuite}                        from "../../kolibri/util/test.js";
import {INITIAL_OBS_VALUE, ObservableMap}       from "./observableMap.js";
import {POISON_PILL_VALUE} from "../../server/S7-manyObs-SSE/remoteObservableMap.js";

const suite = TestSuite("observable/observableMap");

suite.add("basic", assert => {

    let exampleObs     = null;
    let observedValue = "not yet set";
    const onNewObservableNameCallback = namedObs => {
        if(namedObs.id === "example") {
            exampleObs = namedObs;
            exampleObs.onChange( it => {
                assert.isTrue(!! it); // no null or undefined comes in here
                assert.isTrue( INITIAL_OBS_VALUE !== it);
                observedValue = it
            });
        }
    };
    const observableMap = ObservableMap(onNewObservableNameCallback);
    assert.is(exampleObs, null); // of course

    observableMap.addObservableForID("example");

    assert.isTrue(!! exampleObs);

    assert.is(observedValue, "not yet set"); // init state

    exampleObs.setValue("firstValue");

    assert.is(observedValue, "firstValue");

    observableMap.removeObservableForID("example");
    assert.is(observedValue, POISON_PILL_VALUE);
});


suite.run();
