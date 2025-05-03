#!/usr/bin/env node

switch(process.argv[2]) {	
	//
	// 🐱 CAT-GEN
	//
	case 'cat':
		import('./cmd/cat.js');
		break;

	//
	// 📝 REVIEW-GEN
	//
	case 'review':
		import('./cmd/review.js');
		break;

	//
	// 🤖 COMMIT-GEN 💬
	//
	default:
		import('./cmd/commit.js');
		break;
}