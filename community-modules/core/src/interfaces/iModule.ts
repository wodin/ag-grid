import type { ControllerMeta } from '../context/context';
import { ComponentMeta } from '../context/context';
import type { ComponentClass } from '../widgets/component';
import type { RowModelType } from './iRowModel';

export type ModuleValidationValidResult = {
    isValid: true;
};

export type ModuleValidationInvalidResult = {
    isValid: false;
    message: string;
};

export type ModuleValidationResult = ModuleValidationValidResult | ModuleValidationInvalidResult;

export interface Module {
    version: string;
    /**
     * Validation run when registering the module
     *
     * @return Whether the module is valid or not. If not, a message explaining why it is not valid
     */
    validate?: () => ModuleValidationResult;
    moduleName: string;
    beans?: any[];
    agStackComponents?: ComponentClass[];
    controllers?: ControllerMeta[];
    userComponents?: { componentName: string; componentClass: any }[];
    rowModel?: RowModelType;
    dependantModules?: Module[]; // Niall / Sean - my addition
}
