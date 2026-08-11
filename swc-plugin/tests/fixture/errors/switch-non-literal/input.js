import { switchBuildCondition } from 'build-conditions';
import { branches } from './branches';
export const x = switchBuildCondition(branches);
