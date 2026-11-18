// Leiter Minus (Regelwerk 5.2, 6.2). Zugarten in plus-minus.js.
import { makeLadder } from './plus-minus.js?v=a8133bc4';

const ladder = makeLadder('sub');
export const kinds = ladder.kinds;
export const drawStage = ladder.drawStage;
