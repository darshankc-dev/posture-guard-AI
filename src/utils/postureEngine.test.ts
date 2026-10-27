import test from 'node:test';
import assert from 'node:assert/strict';
import { WebPostureEngine } from './postureEngine';

test('WebPostureEngine initializes in UNASSESSED state', () => {
  const engine = new WebPostureEngine();
  assert.equal(engine.currentState, 'UNASSESSED');
});

test('WebPostureEngine evaluates balanced baseline as GOOD', () => {
  const engine = new WebPostureEngine({
    neckLengthRatio: 0.55,
    shoulderWidthNorm: 0.35,
    shoulderTiltDeg: 0.0,
    headTiltDeg: 0.0,
    headForwardDropRatio: 0.25,
    refMidShoulderY: 0.60,
    isValid: true,
  });

  const nose: [number, number, number] = [0.5, 0.35, 0.95];
  const leftEar: [number, number, number] = [0.43, 0.30, 0.95];
  const rightEar: [number, number, number] = [0.57, 0.30, 0.95];
  const leftShoulder: [number, number, number] = [0.325, 0.60, 0.95];
  const rightShoulder: [number, number, number] = [0.675, 0.60, 0.95];

  const result = engine.evaluate(nose, leftEar, rightEar, leftShoulder, rightShoulder, 100.0);
  assert.equal(result.state, 'GOOD');
  assert.equal(result.primaryDeviation, 'none');
  assert.match(result.message.toLowerCase(), /sitting comfortably/);
});

test('Forward head deviation enters WARNING and transitions to ALERT after delay', () => {
  const engine = new WebPostureEngine({
    neckLengthRatio: 0.55,
    shoulderWidthNorm: 0.35,
    shoulderTiltDeg: 0.0,
    headTiltDeg: 0.0,
    headForwardDropRatio: 0.25,
    refMidShoulderY: 0.60,
    isValid: true,
  });
  engine.alertDelaySeconds = 3.0;

  // Severe forward head drop
  const badNose: [number, number, number] = [0.5, 0.48, 0.95];
  const badLeftEar: [number, number, number] = [0.43, 0.45, 0.95];
  const badRightEar: [number, number, number] = [0.57, 0.45, 0.95];
  const leftShoulder: [number, number, number] = [0.325, 0.60, 0.95];
  const rightShoulder: [number, number, number] = [0.675, 0.60, 0.95];

  // At t=0 -> WARNING
  const res1 = engine.evaluate(badNose, badLeftEar, badRightEar, leftShoulder, rightShoulder, 0.0);
  assert.equal(res1.state, 'WARNING');
  assert.equal(res1.primaryDeviation, 'forward_head');

  // At t=2.0s -> Still WARNING (< 3.0s delay)
  const res2 = engine.evaluate(badNose, badLeftEar, badRightEar, leftShoulder, rightShoulder, 2.0);
  assert.equal(res2.state, 'WARNING');

  // At t=3.5s -> ALERT (> 3.0s delay)
  const res3 = engine.evaluate(badNose, badLeftEar, badRightEar, leftShoulder, rightShoulder, 3.5);
  assert.equal(res3.state, 'ALERT');
  assert.match(res3.message.toLowerCase(), /head/);
});

test('Alert cooldown prevents immediate re-triggering', () => {
  const engine = new WebPostureEngine();
  engine.alertCooldownSeconds = 15.0;

  assert.equal(engine.canTriggerAlert(100.0), true);
  engine.registerAlertTriggered(100.0);

  // At t=105s, cooldown is still active (only 5s elapsed out of 15s)
  assert.equal(engine.canTriggerAlert(105.0), false);

  // At t=116s, cooldown has passed (16s > 15s)
  assert.equal(engine.canTriggerAlert(116.0), true);
});
