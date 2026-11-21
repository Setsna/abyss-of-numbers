// Leiter Plus (Regelwerk 5.1, 6.1). Zugarten in plus-minus.js.
import { makeLadder } from './plus-minus.js?v=5d2bb76b';

const ladder = makeLadder('add');
export const kinds = ladder.kinds;
export const drawStage = ladder.drawStage;
