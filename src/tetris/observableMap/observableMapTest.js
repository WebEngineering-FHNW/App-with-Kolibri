import {TestSuite}     from "../../kolibri/util/test.js";
import {ObservableMap} from "./observableMap.js";
import {POISON_PILL}   from "../../server/S7-manyObs-SSE/remoteObservableClient.js";

const suite = TestSuite("observable/observableMap");

suite.add("basic", assert => {

    let observed          = null;
    const newNameCallback = v => observed = v;
    const map             = ObservableMap(newNameCallback);
    assert.is(observed, null); // no callback on init

    map.addObservableForID("a");
    assert.is(observed.id, "a"); // now we got the callback
    assert.is(observed.observable.getValue().mode, "passive");  // with mode and value
    assert.is(observed.observable.getValue().value, undefined); // (initially undefined)

    map.removeObservableForID("a");
    assert.is(observed.id, "a"); // now we got the callback
    assert.is(observed.observable.getValue(), POISON_PILL);

});

suite.run();
