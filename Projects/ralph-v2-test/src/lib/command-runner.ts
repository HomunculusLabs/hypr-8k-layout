import type { OutputOptions } from "../types";
import { reportError } from "./output";

type CommandFn<T> = (options: T, context: CommandContext) => Promise<void>;

interface CommandContext {
	setOutputOptions: (options: OutputOptions) => void;
}

const DEFAULT_OUTPUT_OPTIONS: OutputOptions = {
	format: "console",
	color: true,
	verbose: false,
	quiet: false,
};

export function createCommandRunner<T>(fn: CommandFn<T>): (options: T) => Promise<void> {
	return async (options: T) => {
		let outputOptions = DEFAULT_OUTPUT_OPTIONS;
		const setOutputOptions = (options: OutputOptions): void => {
			outputOptions = options;
		};

		try {
			await fn(options, { setOutputOptions });
		} catch (error) {
			reportError(error, outputOptions);
			process.exitCode = 1;
		}
	};
}
