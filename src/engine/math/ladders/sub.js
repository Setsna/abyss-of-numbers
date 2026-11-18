// Leiter Minus (Regelwerk 5.2, 6.2). Zugarten in plus-minus.js.
import { makeLadder } from './plus-minus.js?v=2c640ccc';

const ladder = makeLadder('sub');
export const kinds = ladder.kinds;
export const drawStage = ladder.drawStage;
