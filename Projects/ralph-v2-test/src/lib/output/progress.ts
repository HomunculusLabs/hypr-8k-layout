export interface Progress {
	increment(): void;
	complete(): void;
	fail(error: string): void;
}

export function createProgress(total: number, label: string): Progress {
	let current = 0;
	let done = false;

	function log(message: string): void {
		if (done) return;
		console.log(message);
	}

	return {
		increment() {
			if (done) return;
			current += 1;
			const count = total > 0 ? `${current}/${total}` : `${current}`;
			log(`${label}: ${count}`);
		},
		complete() {
			if (done) return;
			done = true;
			const count = total > 0 ? `${total}` : `${current}`;
			console.log(`${label}: complete (${count})`);
		},
		fail(error: string) {
			if (done) return;
			done = true;
			console.error(`${label}: failed (${error})`);
		},
	};
}
