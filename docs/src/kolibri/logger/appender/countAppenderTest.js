import {TestSuite} from "../../util/test.js";
import {Appender}  from "./countAppender.js";

const { trace, debug, info, warn, error, fatal, getValue, reset } = Appender();
reset(); // clear the state of the appender since it is a singleton

const countAppenderSuite = TestSuite("Count Appender");

countAppenderSuite.add("test add debug value to count appender", assert => {
  const result = debug("debug");
  assert.is(result, T);
  assert.is(getValue().debug, 1);
  reset();
});

countAppenderSuite.add("test add two values to count appender", assert => {
  const result1 = debug("first");
  const result2 = debug("second");
  assert.is(result1, T);
  assert.is(result2, T);
  assert.is(getValue().debug, 2);
  reset();
});

countAppenderSuite.add("test reset count appender", assert => {
  const result1 = debug("first");
  assert.is(result1, T);
  assert.is(getValue().debug, 1);
  reset();
  assert.isTrue(0 === getValue().debug );
});

countAppenderSuite.add("test add all kind of levels to count appender", assert => {
  const traceResult  = trace("trace");
  const debugResult  = debug("debug");
  const infoResult   = info ("info");
  const warnResult   = warn ("warn");
  const errorResult  = error("error");
  const fatalResult  = fatal("fatal");
  assert.is(traceResult, T);
  assert.is(debugResult, T);
  assert.is(infoResult, T);
  assert.is(warnResult, T);
  assert.is(errorResult, T);
  assert.is(fatalResult, T);
  assert.is(getValue().trace,  1);
  assert.is(getValue().debug,  1);
  assert.is(getValue().info,   1);
  assert.is(getValue().warn,   1);
  assert.is(getValue().error,  1);
  assert.is(getValue().fatal,  1);
  reset();
  assert.isTrue(0 === getValue().trace);
  assert.isTrue(0 === getValue().debug);
  assert.isTrue(0 === getValue().info);
  assert.isTrue(0 === getValue().warn);
  assert.isTrue(0 === getValue().error);
  assert.isTrue(0 === getValue().fatal);
});

countAppenderSuite.run();
