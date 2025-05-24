import {ownPropEqual, shapeEqual} from "./util.js";
import {TestSuite}                from "../../kolibri/util/test.js";
import "../../kolibri/util/array.js"

const utilSuite = TestSuite("tetris/util");

utilSuite.add( "ownPropsEqual", assert => {
    assert.isTrue(ownPropEqual( document, document)); // invariant: same obj is props equal, even complex ones.
    assert.isTrue(ownPropEqual({}, {}));
    assert.isTrue(ownPropEqual({x:0}, {x:0}));
}) ;

utilSuite.add( "shapeEqual", assert => {
    assert.isTrue(shapeEqual( [document], [document])); // invariant: same obj is props equal, even complex ones.
    assert.isTrue(shapeEqual([], []));
    assert.isTrue(shapeEqual(3..times(), 3..times()));
}) ;

utilSuite.run();
