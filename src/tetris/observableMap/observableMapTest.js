import {TestSuite}     from "../../kolibri/util/test.js";
import {ObservableMap}       from "./observableMap.js";
import {active, POISON_PILL} from "../../server/S7-manyObs-SSE/remoteObservableMap.js";

const suite = TestSuite("observable/observableMap");

suite.add("basic", assert => {

    let exampleObs     = null;
    let observedValue = null;
    const onNewObservableNameCallback = namedObs => {
        if(namedObs.id === "example") {
            exampleObs = namedObs.observable;
            exampleObs.onChange( it => observedValue = it);
        }
    };
    const observableMap = ObservableMap(onNewObservableNameCallback);
    assert.is(exampleObs, null); // of course

    observableMap.addObservableForID("example");

    assert.isTrue(!! exampleObs);

    // observable was created with an initial value of undefined

    assert.is(observedValue.mode, "passive");  // with mode and value
    assert.is(observedValue.value, undefined); // initially undefined

    exampleObs.setValue(active("firstValue"));

    assert.is(observedValue.mode,  "active");
    assert.is(observedValue.value, "firstValue");

    observableMap.removeObservableForID("example");
    assert.is(observedValue, POISON_PILL);
});


suite.run();
