const { DiagnosticSeverity: Severity } = require('vscode-languageserver/node');
const { replaceCommentsTags, replaceDocString, replaceStory, getLineKeyword } = require('../utils');
const Keywords = require('../keywords');
const { addToDiagnostics } = require('./helper');
const Messages = require('./messages');
const { globalMatch, firstMatch } = require('../regex');

module.exports.validateDocument = function (document, docConfig) {
    const diagnostics = [];
    validateFeatureOccurance(document, diagnostics);
    validateStartingStep(document, diagnostics);

    const simpleText = getSimpleText(document);
    validateByLine(document, simpleText, diagnostics);
    return diagnostics;
};

function validateFeatureOccurance(document, diagnostics) {
    const text = document.getText();
    const regex = globalMatch.feature;
    let matchCount = 0;
    while ((match = regex.exec(text))) {
        matchCount++;
        // only show error from second match onward
        if (matchCount > 1) {
            addToDiagnostics(
                document,
                diagnostics,
                match.index,
                match.index + match[0].length,
                Messages.mustHaveOnlyOneFeature,
                Severity.Error
            );
        }
    }
    if (!matchCount) {
        addToDiagnostics(document, diagnostics, 1, 1, Messages.mustHaveFeatureName, Severity.Error);
    }
}

function validateStartingStep(document, diagnostics) {
    const text = replaceCommentsTags(document.getText());
    const regex = globalMatch.beginningStep;

    while ((match = regex.exec(text))) {
        matchStep = match[0].trim();
        if (![Keywords.Given, Keywords.When].includes(matchStep)) {
            addToDiagnostics(
                document,
                diagnostics,
                match.index,
                match.index + match[0].length,
                Messages.firstStepShouldBeGivenOrWhen
            );
        }
    }
}

function validateByLine(document, text, diagnostics) {
    const lines = text.split('\n');
    const regex = firstMatch.step;

    let prevStep = '';
    let index = 0;
    let keywordHit = false;
    lines.forEach((line) => {
        let lineLength = line.length;
        if (lineLength === 0) {
            lineLength = 1;
        } else {
            // also count line break
            lineLength += 1;
        }

        // do not process empty line
        if (!line.trim().length) {
            index += lineLength;
            return;
        }

        const keyword = getLineKeyword(line);
        if (!keyword) {
            addToDiagnostics(document, diagnostics, index, index + line.length, Messages.invalidLine, Severity.Error);
            index += lineLength;
            return;
        } else if (!keywordHit && keyword !== Keywords.Feature) {
            addToDiagnostics(
                document,
                diagnostics,
                index,
                index + line.length,
                Messages.mustStartWithFeatureName,
                Severity.Error
            );
        }
        keywordHit = true;

        const match = regex.exec(line);
        if (Boolean(match)) {
            const matchStep = match[0];
            if (prevStep === matchStep) {
                const rangeEnd = index + match.index + matchStep.length;
                let message = Messages.repeatedStep;
                if (matchStep === Keywords.Then) {
                    message = Messages.repeatedStepForThen;
                }
                addToDiagnostics(document, diagnostics, index + match.index, rangeEnd, message);
            }
            if (matchStep !== Keywords.And) {
                prevStep = matchStep;
            }
        } else {
            prevStep = '';
        }
        index += lineLength;
    });
}

// returns text where tags, comments, user story and docstring are replaced with spaces
function getSimpleText(document) {
    let text = replaceCommentsTags(document.getText());
    text = replaceDocString(text);
    text = replaceStory(text);
    return text;
}
