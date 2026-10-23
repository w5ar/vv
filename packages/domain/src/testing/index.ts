/**
 * SYNTHETIC unit-test fixtures. Not derived from any source material and not
 * a firefighting procedure: names are deliberately generic ("test").
 */
import { CatalogSchema, type Catalog, type CatalogInput } from '../catalog';
import { ExerciseSchema, type Exercise, type ExerciseInput } from '../exercise';

const synthetic = { provenance: 'synthetic' as const, review: { status: 'requires-review' as const } };

export const testCatalogInput: CatalogInput = {
  schemaVersion: 1,
  id: 'test-catalog',
  name: 'Testni katalog (sintetički)',
  synthetic: true,
  categories: [
    { id: 'cat.equipment', name: 'Oprema (test)' },
    { id: 'cat.personnel', name: 'Osoblje (test)' },
  ],
  portTypes: [
    { id: 'pt.large', name: 'Veliki spoj (test)', ...synthetic },
    { id: 'pt.small', name: 'Mali spoj (test)', ...synthetic },
    { id: 'pt.blocked', name: 'Zabranjeni spoj (test)', ...synthetic },
  ],
  connectionRules: [
    { id: 'rule.large-large', portTypes: ['pt.large', 'pt.large'], effect: 'allow', ...synthetic },
    { id: 'rule.small-small', portTypes: ['pt.small', 'pt.small'], effect: 'allow', ...synthetic },
    { id: 'rule.small-blocked-allow', portTypes: ['pt.small', 'pt.blocked'], effect: 'allow', ...synthetic },
    {
      id: 'rule.small-blocked-deny',
      portTypes: ['pt.blocked', 'pt.small'],
      effect: 'deny',
      message: 'Testno pravilo zabrane.',
      ...synthetic,
    },
  ],
  symbols: [
    {
      id: 'sym.source',
      name: 'Izvor (test)',
      category: 'cat.equipment',
      asset: { path: 'test/source.svg' },
      size: { width: 80, height: 40 },
      ports: [
        { id: 'out-1', type: 'pt.large', position: { x: 80, y: 10 }, direction: 0 },
        { id: 'out-2', type: 'pt.large', position: { x: 80, y: 30 }, direction: 0 },
      ],
      rotation: { mode: 'none' },
      ...synthetic,
    },
    {
      id: 'sym.hose',
      name: 'Cijev (test)',
      category: 'cat.equipment',
      asset: { path: 'test/hose.svg' },
      size: { width: 60, height: 10 },
      ports: [
        { id: 'end-a', type: 'pt.large', position: { x: 0, y: 5 }, direction: 180 },
        { id: 'end-b', type: 'pt.large', position: { x: 60, y: 5 }, direction: 0 },
      ],
      ...synthetic,
    },
    {
      id: 'sym.splitter',
      name: 'Razdjelnik (test)',
      category: 'cat.equipment',
      asset: { path: 'test/splitter.svg' },
      size: { width: 40, height: 40 },
      ports: [
        { id: 'in', type: 'pt.large', position: { x: 0, y: 20 }, direction: 180 },
        { id: 'out-a', type: 'pt.small', position: { x: 40, y: 10 }, direction: 0 },
        { id: 'out-b', type: 'pt.small', position: { x: 40, y: 30 }, direction: 0 },
      ],
      rotation: { mode: 'step', stepDegrees: 90 },
      ...synthetic,
    },
    {
      id: 'sym.nozzle',
      name: 'Mlaznica (test)',
      category: 'cat.equipment',
      asset: { path: 'test/nozzle.svg' },
      size: { width: 30, height: 14 },
      ports: [{ id: 'in', type: 'pt.small', position: { x: 0, y: 7 }, direction: 180 }],
      visualStates: [
        { id: 'closed', name: 'Zatvoreno' },
        { id: 'open', name: 'Otvoreno' },
      ],
      defaultState: 'closed',
      ...synthetic,
    },
    {
      id: 'sym.blocked',
      name: 'Zabranjeni (test)',
      category: 'cat.equipment',
      asset: { path: 'test/blocked.svg' },
      size: { width: 20, height: 20 },
      ports: [{ id: 'x', type: 'pt.blocked', position: { x: 10, y: 10 } }],
      ...synthetic,
    },
    {
      id: 'sym.person',
      name: 'Osoba (test)',
      category: 'cat.personnel',
      asset: { path: 'test/person.svg' },
      size: { width: 30, height: 30 },
      rotation: { mode: 'step', stepDegrees: 45 },
      ...synthetic,
    },
  ],
  equipmentTypes: [
    { id: 'et.source', name: 'Izvor (test)', symbolId: 'sym.source', portable: false, ...synthetic },
    { id: 'et.hose', name: 'Cijev (test)', symbolId: 'sym.hose', portable: true, ...synthetic },
    { id: 'et.splitter', name: 'Razdjelnik (test)', symbolId: 'sym.splitter', portable: true, ...synthetic },
    { id: 'et.nozzle', name: 'Mlaznica (test)', symbolId: 'sym.nozzle', portable: true, ...synthetic },
    { id: 'et.blocked', name: 'Zabranjeni (test)', symbolId: 'sym.blocked', portable: false, ...synthetic },
  ],
  roles: [
    { id: 'role.leader', name: 'Voditelj (test)', ...synthetic },
    { id: 'role.member', name: 'Član (test)', ...synthetic },
  ],
};

export function makeTestCatalog(): Catalog {
  return CatalogSchema.parse(testCatalogInput);
}

export const testExerciseInput: ExerciseInput = {
  schemaVersion: 1,
  id: 'test-exercise',
  title: 'Testna vježba (sintetička)',
  synthetic: true,
  catalogId: 'test-catalog',
  provenance: 'synthetic',
  settings: { pickUpDistance: 60, placeDistance: 120, maxCarriedPerPerson: 2 },
  actions: [
    {
      id: 'act.report',
      name: 'Javljanje spremnosti (test)',
      actorRoleIds: ['role.member'],
      requires: { type: 'connected', a: { objectId: 'splitter' }, b: { objectId: 'nozzle' } },
      durationMs: 1000,
      ...synthetic,
    },
  ],
  initialScene: {
    personnel: [
      { id: 'p1', symbolId: 'sym.person', roleId: 'role.leader', position: { x: 100, y: 300 } },
      { id: 'p2', symbolId: 'sym.person', roleId: 'role.member', position: { x: 160, y: 300 } },
    ],
    equipment: [
      { id: 'source', typeId: 'et.source', position: { x: 100, y: 100 } },
      { id: 'hose1', typeId: 'et.hose', position: { x: 240, y: 90 } },
      { id: 'splitter', typeId: 'et.splitter', position: { x: 120, y: 320 } },
      { id: 'nozzle', typeId: 'et.nozzle', position: { x: 175, y: 320 } },
      { id: 'blocked', typeId: 'et.blocked', position: { x: 600, y: 600 } },
    ],
    zones: [{ id: 'zone.work', name: 'Radni prostor (test)', shape: { type: 'rect', rect: { x: 350, y: 50, width: 200, height: 150 } } }],
  },
  stages: [
    { id: 'stage.1', name: 'Faza 1 (test)' },
    { id: 'stage.2', name: 'Faza 2 (test)' },
  ],
  steps: [
    {
      id: 's1',
      title: 'Postavi razdjelnik u radni prostor',
      stageId: 'stage.1',
      completedWhen: { type: 'inZone', objectId: 'splitter', zoneId: 'zone.work' },
      script: [
        { command: { type: 'PickUpEquipment', personnelId: 'p1', equipmentId: 'splitter' } },
        { command: { type: 'MovePersonnel', personnelId: 'p1', to: { x: 400, y: 160 } } },
        { command: { type: 'PlaceEquipment', personnelId: 'p1', equipmentId: 'splitter', at: { x: 450, y: 120 } } },
      ],
      ...synthetic,
    },
    {
      id: 's2',
      title: 'Spoji cijev na izvor',
      stageId: 'stage.1',
      completedWhen: {
        type: 'connected',
        a: { objectId: 'source', portId: 'out-1' },
        b: { objectId: 'hose1', portId: 'end-a' },
      },
      script: [
        {
          command: {
            type: 'ConnectPorts',
            a: { objectId: 'source', portId: 'out-1' },
            b: { objectId: 'hose1', portId: 'end-a' },
            connectionId: 'c1',
          },
        },
      ],
      ...synthetic,
    },
    {
      id: 's3',
      title: 'Spoji cijev na razdjelnik',
      stageId: 'stage.2',
      dependsOn: ['s1', 's2'],
      completedWhen: {
        type: 'connected',
        a: { objectId: 'hose1', portId: 'end-b' },
        b: { objectId: 'splitter', portId: 'in' },
      },
      script: [
        {
          command: {
            type: 'ConnectPorts',
            a: { objectId: 'hose1', portId: 'end-b' },
            b: { objectId: 'splitter', portId: 'in' },
            connectionId: 'c2',
          },
        },
      ],
      ...synthetic,
    },
    {
      id: 's4',
      title: 'Spoji mlaznicu na razdjelnik',
      stageId: 'stage.2',
      dependsOn: ['s3'],
      completedWhen: { type: 'connected', a: { objectId: 'splitter' }, b: { objectId: 'nozzle' } },
      script: [
        { command: { type: 'PickUpEquipment', personnelId: 'p2', equipmentId: 'nozzle' } },
        { command: { type: 'MovePersonnel', personnelId: 'p2', to: { x: 500, y: 170 } } },
        { command: { type: 'PlaceEquipment', personnelId: 'p2', equipmentId: 'nozzle', at: { x: 520, y: 110 } } },
        {
          command: {
            type: 'ConnectPorts',
            a: { objectId: 'splitter', portId: 'out-a' },
            b: { objectId: 'nozzle', portId: 'in' },
            connectionId: 'c3',
          },
        },
      ],
      ...synthetic,
    },
    {
      id: 's5',
      title: 'Javi spremnost',
      stageId: 'stage.2',
      dependsOn: ['s4'],
      completedWhen: { type: 'actionCompleted', actionId: 'act.report' },
      script: [
        { command: { type: 'BeginAction', actionId: 'act.report', actorIds: ['p2'] } },
        { command: { type: 'CompleteAction', actionId: 'act.report' } },
      ],
      ...synthetic,
    },
  ],
  rules: [
    {
      type: 'commandPrecondition',
      id: 'rule.nozzle-after-hose',
      when: { commandTypes: ['ConnectPorts'], objectIds: ['nozzle'] },
      requires: { type: 'stepCompleted', stepId: 's3' },
      severity: 'error',
      message: 'Mlaznica se spaja tek kada je cijev spojena na razdjelnik (testno pravilo).',
      ...synthetic,
    },
    {
      type: 'noOverlap',
      id: 'rule.no-overlap-source',
      groupA: { kinds: ['personnel'] },
      groupB: { objectIds: ['source'] },
      severity: 'error',
      message: 'Osoba ne smije stajati na izvoru (testno pravilo).',
      ...synthetic,
    },
  ],
  assessment: {
    criteria: [
      { type: 'allRequiredStepsCompleted', id: 'crit.steps', label: 'Svi koraci izvršeni' },
      { type: 'maxRejectedCommands', id: 'crit.errors', label: 'Najviše 2 neispravne radnje', limit: 2 },
    ],
    ...synthetic,
  },
};

export function makeTestExercise(): Exercise {
  return ExerciseSchema.parse(testExerciseInput);
}
