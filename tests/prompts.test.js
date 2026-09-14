const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  SYSTEM_PROMPT_TEMPLATE, DYNAMIC_VARIABLE_DEFAULTS, DEFAULT_OPENING_LINE,
  buildCharacterInstructions, buildDynamicVariables,
} = require('../src/training/prompts');

const persona = { name: 'Marcus Johnson', backstory: 'Warehouse worker, cracked rib.', emotionalState: 'distressed', openingLine: 'Hi, I hurt my chest.' };

describe('training prompts', () => {
  it('template references every dynamic variable that has a default', () => {
    for (const key of Object.keys(DYNAMIC_VARIABLE_DEFAULTS)) {
      if (key === 'opening_line') continue; // used in first_message, not the prompt
      assert.ok(SYSTEM_PROMPT_TEMPLATE.includes(`{{${key}}}`), `template missing {{${key}}}`);
    }
    assert.ok(SYSTEM_PROMPT_TEMPLATE.includes('end_call'));
    assert.ok(SYSTEM_PROMPT_TEMPLATE.includes('knowledge base'));
  });

  it('scripted instructions embed the persona', () => {
    const text = buildCharacterInstructions({ mode: 'scripted', persona, claimType: 'workplace_injury' });
    assert.ok(text.includes('Name: Marcus Johnson'));
    assert.ok(text.includes('Warehouse worker, cracked rib.'));
    assert.ok(text.includes('Emotional state: distressed'));
    assert.ok(text.includes('You are Marcus Johnson'));
  });

  it('freestyle instructions ask the model to invent a persona for the claim type', () => {
    const text = buildCharacterInstructions({ mode: 'freestyle', persona: null, claimType: 'workplace_injury' });
    assert.ok(/invent a realistic customer persona/i.test(text));
    assert.ok(text.includes('workplace injury'));
    assert.ok(!text.includes('Marcus'));
  });

  it('dynamic variables use the persona opening line in scripted mode and the default in freestyle', () => {
    const scripted = buildDynamicVariables({ mode: 'scripted', persona, claimType: 'workplace_injury' });
    assert.strictEqual(scripted.opening_line, 'Hi, I hurt my chest.');
    assert.strictEqual(scripted.claim_type, 'workplace injury');
    const free = buildDynamicVariables({ mode: 'freestyle', persona: null, claimType: 'slip_and_fall' });
    assert.strictEqual(free.opening_line, DEFAULT_OPENING_LINE);
    assert.deepStrictEqual(Object.keys(free).sort(), ['caller_context', 'character_instructions', 'claim_type', 'opening_line']);
  });

  it('caller context defaults to the insurer framing and uses the scenario text when set', () => {
    const legacy = buildDynamicVariables({ mode: 'scripted', persona, claimType: 'workplace_injury' });
    assert.ok(legacy.caller_context.includes('calling an insurer to file a workplace injury claim'));
    assert.ok(legacy.caller_context.includes('Incident Details'));
    const custom = buildDynamicVariables({ mode: 'scripted', persona, claimType: 'crisis_support', callerContext: '  You are calling Services Australia.  ' });
    assert.strictEqual(custom.caller_context, 'You are calling Services Australia.');
  });
});
