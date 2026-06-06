const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("--- AI CLI Simulator ---");
console.log("Tokens: 1200");

function ask() {
    rl.question("AI suggests deleting all files. Approve? (y/n): ", (answer) => {
        if (answer.toLowerCase() === 'y') {
            console.log("Action APPROVED. Deleting...");
            console.log("Tokens: 2500");
        } else {
            console.log("Action DENIED. Aborting.");
        }
        process.exit(0);
    });
}

// Wait a bit to simulate processing
setTimeout(ask, 2000);
