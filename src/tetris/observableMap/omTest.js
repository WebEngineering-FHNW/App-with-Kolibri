import {TestSuite} from "../../kolibri/util/test.js";
import {OM}        from "./om.js";

const suite = TestSuite("observable/om");

suite.add("basic get/set", assert => {

    const om = OM();

    const notFound = om.getValue("no-such-key");
    notFound
        (_ => assert.isTrue(true))
        (_v=> assert.isTrue(false)); // we must not get a value

    om.setValue("goodKey","goodValue");

    const willBeFound = om.getValue("goodKey");
    willBeFound
        (_ => assert.isTrue(false))
        (v => assert.is("goodValue", v));

    om.setValue("goodKey", undefined);

    // values are never undefined
    const noUndefined = om.getValue("goodKey");
    noUndefined
        (_  => assert.isTrue(true))
        (_v => assert.isTrue(false));

    om.setValue("goodKey", null);

    // values are never null
    const noNull = om.getValue("goodKey");
    noNull
        (_  => assert.isTrue(true))
        (_v => assert.isTrue(false));

});

suite.add("listeners", assert => {

    const added = [];
    const removed = [];
    const changed = [];

    const om = OM();

    om.setValue("keyA","valueA");

    assert.is(added.length, 0);
    assert.is(removed.length, 0);
    assert.is(changed.length, 0);

    om.onKeyAdded( key => added.push(key));
    om.onKeyRemoved( key => removed.push(key));

    // nothing changed, yet
    assert.is(added.length, 0);
    assert.is(removed.length, 0);
    assert.is(changed.length, 0);

    om.onChange( (key, value) => changed.push( [key, value] ));

    // immediate callback when registering
    assert.is(added.length, 0);
    assert.is(removed.length, 0);
    assert.is(changed.length, 1);
    assert.is(changed.at(-1)[0], "keyA");
    assert.is(changed.at(-1)[1], "valueA");

    // existing value change
    om.setValue("keyA","valueA2");

    assert.is(added.length, 0);
    assert.is(removed.length, 0);
    assert.is(changed.length, 2);
    assert.is(changed.at(-1)[0], "keyA");
    assert.is(changed.at(-1)[1], "valueA2");

    // new value adds and changes
    om.setValue("keyB","valueB");

    assert.is(added.length, 1);
    assert.is(removed.length, 0);
    assert.is(changed.length, 3);
    assert.is(changed.at(-1)[0], "keyB");
    assert.is(changed.at(-1)[1], "valueB");

    // setting to the same value is not a change
    om.setValue("keyB","valueB");

    assert.is(added.length, 1);
    assert.is(removed.length, 0);
    assert.is(changed.length, 3);
    assert.is(changed.at(-1)[0], "keyB");
    assert.is(changed.at(-1)[1], "valueB");

    // how to remove
    om.removeKey("keyB");

    assert.is(added.length, 1);
    assert.is(removed.length, 1);
    assert.is(changed.length, 3);

    // null or undefined removes (is not a change)
    om.setValue("keyA", null);

    assert.is(added.length, 1);
    assert.is(removed.length, 2);
    assert.is(changed.length, 3);

    // which means that onChange listeners will
    // never be called with a null or undefined value

});


suite.run();
