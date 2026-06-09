const SCENARIOS = {
  'chest-injury': {
    id: 'chest-injury',
    name: 'Chest Injury Claim',
    description: 'Injured worker reporting severe chest pain from a warehouse lifting incident.',
    claimType: 'workplace_injury',
    difficulty: 'beginner',
    maxDurationSeconds: 180,
    personas: [
      {
        name: 'Marcus Johnson',
        gender: 'male',
        backstory: `Marcus is a 34-year-old warehouse worker at Metro Logistics. Yesterday at 2 PM, he was lifting heavy boxes alone (his supervisor said he shouldn't have been doing it solo). He felt a sharp snap in his chest. Went to City General Hospital ER - Dr. Patel diagnosed possible cracked rib and muscle damage. He's on pain meds and told not to work. He's worried about lost wages and his family. Policy: WC-2024-88431. Witness: Jenny Park from loading dock. Supervisor: Dave Chen.`,
        emotionalState: 'distressed, in pain, worried about finances',
      },
      {
        name: 'Sarah Mitchell',
        gender: 'female',
        backstory: `Sarah is a 28-year-old retail stockroom associate at Hartfield Stores. Two days ago during the morning rush, she was stacking heavy inventory crates on the top shelf when one slipped and struck her in the chest. She went to Riverside Urgent Care where Dr. Gomez found bruised ribs and possible cartilage damage. She's never filed a claim before and has no idea how the process works. She's anxious about missing her shifts and losing income — she's a single mother of a 4-year-old. Policy: WC-2024-90215. Witness: Tyler Okafor, shift manager.`,
        emotionalState: 'anxious, scared, confused about the process',
      },
      {
        name: 'David Nguyen',
        gender: 'male',
        backstory: `David is a 45-year-old maintenance technician at Pacific Industrial Park. Last week he was repairing an overhead conveyor system when a loose bracket swung down and hit him square in the chest. He drove himself to St. Mary's Hospital where Dr. Reeves found two fractured ribs. He's been on workers' comp before at a previous job and knows the drill, but he's frustrated because he reported the faulty bracket three times. Policy: WC-2024-87650. Witness: Ana Ruiz, floor supervisor. Safety report filed by: Greg Thompson.`,
        emotionalState: 'frustrated, knowledgeable about the process, angry at management',
      },
    ],
  },
  'hearing-loss': {
    id: 'hearing-loss',
    name: 'Noise-Induced Hearing Loss',
    description: 'Factory worker filing claim for gradual hearing deterioration over 5 years.',
    claimType: 'workplace_injury',
    difficulty: 'intermediate',
    maxDurationSeconds: 180,
    personas: [
      {
        name: 'Linda Torres',
        gender: 'female',
        backstory: `Linda is a 52-year-old machine operator at Consolidated Manufacturing. She's worked on the stamping press line for 5 years with inconsistent hearing protection. Over the past year, she's noticed significant hearing loss - can't hear conversations in noisy rooms, TV volume keeps going up, ringing in ears. Audiologist Dr. Chen at Hearing Health Clinic confirmed noise-induced sensorineural hearing loss. She's frustrated because she reported noise concerns to her supervisor Tom Bradley multiple times. Policy: WC-2023-55218. Coworker Mike Davis can confirm the noise levels.`,
        emotionalState: 'frustrated, confused about process, somewhat angry at employer',
      },
      {
        name: 'James Kowalski',
        gender: 'male',
        backstory: `James is a 58-year-old heavy equipment operator at Redstone Quarry. He's been operating jackhammers, rock crushers, and drill rigs for 8 years. His wife noticed he keeps asking people to repeat themselves. His GP Dr. Langley referred him to audiologist Dr. Sharma at ClearSound Clinic who diagnosed moderate bilateral sensorineural hearing loss. He's worried this will end his career — operating heavy machinery requires good hearing. His employer provided earplugs but never enforced usage or did noise-level testing. Policy: WC-2023-61445. Coworker: Pete Hanson. Supervisor: Bill Rawlings.`,
        emotionalState: 'worried about career, quiet and stoic but deeply concerned',
      },
      {
        name: 'Priya Desai',
        gender: 'female',
        backstory: `Priya is a 38-year-old production line supervisor at AutoTech Assembly. She's spent 6 years on the factory floor near pneumatic tools and stamping machines. She noticed gradual hearing loss over 2 years — started having trouble on phone calls and missing alarms. Dr. Mehta at Metro Hearing Centre diagnosed early-stage noise-induced hearing loss with tinnitus. She's frustrated because she requested noise barriers for her section twice and was told it wasn't in the budget. Policy: WC-2024-73920. Coworkers: Rachel Kim, Darren West. HR contact: Simone Archer.`,
        emotionalState: 'articulate but frustrated, feels let down by her employer',
      },
    ],
  },
  'physical-injury': {
    id: 'physical-injury',
    name: 'Physical Injury',
    description: 'Construction site fall resulting in multiple fractures.',
    claimType: 'workplace_injury',
    difficulty: 'advanced',
    maxDurationSeconds: 180,
    personas: [
      {
        name: 'Robert Williams',
        gender: 'male',
        backstory: `Robert is a 41-year-old construction worker at Apex Construction. Three days ago, he fell 12 feet from scaffolding that had a broken safety rail he'd reported twice before. He has a broken left arm, fractured collarbone, and bruised ribs. Treated at Memorial Hospital by Dr. Nakamura, currently in a cast and sling. He's furious about safety negligence and wants to know if he can sue. His wife is 7 months pregnant and he's the sole earner. Policy: WC-2024-91102. Witnesses: Carlos Mendez and Jim O'Brien. Supervisor: Frank Peters.`,
        emotionalState: 'angry, demanding, scared about finances',
      },
      {
        name: 'Elena Vasquez',
        gender: 'female',
        backstory: `Elena is a 36-year-old electrician at Summit Builders. She fell 10 feet from a ladder that collapsed because its safety latch was broken — a known issue she'd flagged in the morning meeting. She has a fractured wrist, dislocated shoulder, and severe back bruising. Treated at Northside Medical by Dr. Park, she's now in a wrist cast and arm sling. She's a single earner supporting her elderly parents and is terrified about the recovery timeline. She also suspects her employer will try to blame her for not using a harness. Policy: WC-2024-89340. Witness: Marco Bianchi. Site safety officer: Howard Lee.`,
        emotionalState: 'scared, defensive, worried employer will blame her',
      },
      {
        name: 'Tyrone Jacobs',
        gender: 'male',
        backstory: `Tyrone is a 29-year-old roofer at Crestline Roofing. Yesterday he slipped on an unsecured tarp on a wet roof and fell 15 feet to the ground. He has a broken leg (tibia), fractured pelvis, and a concussion. He's calling from Valley General Hospital where Dr. Russo is treating him. He's in a lot of pain and on heavy medication, so he's a bit groggy. This is his first serious injury and he's overwhelmed. His girlfriend is with him and keeps interrupting. He just started this job 3 months ago and is still on probation. Policy: WC-2024-92780. Witness: Darnell Brooks. Foreman: Steve Callahan.`,
        emotionalState: 'in pain, groggy from medication, overwhelmed and emotional',
      },
    ],
  },
};

function getScenario(id) {
  return SCENARIOS[id] || null;
}

function getAllScenarios() {
  return Object.values(SCENARIOS);
}

function getRandomPersona(scenarioId) {
  const scenario = SCENARIOS[scenarioId];
  if (!scenario) return null;
  const personas = scenario.personas;
  return personas[Math.floor(Math.random() * personas.length)];
}

module.exports = { SCENARIOS, getScenario, getAllScenarios, getRandomPersona };
