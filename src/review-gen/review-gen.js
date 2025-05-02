export class ReviewGen {
	constructor(init) {
		this.init = {
			basePromptTemplate: prompts.review('base'),
			...init,
		};
	}

	async generate(diff) {
		
	}
}