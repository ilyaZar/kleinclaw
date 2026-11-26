import assert from "node:assert/strict";
import path from "node:path";

import {
  CdpLocator,
} from "../dist/browser/cdp-adapter.js";

export async function runCdpLocatorCases({
  createCdpTestPage,
  tmp,
}) {
  const dispatchedKeys = [];
  const typedFunctions = [];
  const typedPage = createCdpTestPage(
    "page-2",
    async (method, params = {}) => {
      if (method === "Runtime.evaluate") {
        return { result: { objectId: "element-1" } };
      }
      if (method === "DOM.describeNode") {
        return { node: { backendNodeId: 123 } };
      }
      if (method === "Runtime.callFunctionOn") {
        typedFunctions.push(params);
        return { result: { value: undefined } };
      }
      if (method === "Input.dispatchKeyEvent") {
        dispatchedKeys.push(params);
      }
      return {};
    },
  );
  const typedLocator = new CdpLocator(typedPage, [
    { kind: "css", value: "#title", index: 0 },
  ]);

  await typedLocator.type("Ab 9!\n");
  assert.equal(typedFunctions.length, 1);
  assert.equal(typedFunctions[0].objectId, "element-1");
  assert.equal(
    typedFunctions[0].functionDeclaration,
    "(element) => element.focus()",
  );
  assert.deepEqual(typedFunctions[0].arguments, [{ objectId: "element-1" }]);
  assert.equal(typedFunctions[0].userGesture, true);
  assert.deepEqual(
    dispatchedKeys.map((event) => [
      event.type,
      event.text,
    ]),
    [
      ["char", "A"],
      ["char", "b"],
      ["char", " "],
      ["char", "9"],
      ["char", "!"],
      ["char", "\n"],
    ],
  );

  const filledFunctions = [];
  typedPage.client.send = async (method, params = {}) => {
    if (method === "Runtime.evaluate") {
      return { result: { objectId: "element-1" } };
    }
    if (method === "DOM.describeNode") {
      return { node: { backendNodeId: 123 } };
    }
    if (method === "Runtime.callFunctionOn") {
      filledFunctions.push(params);
      return { result: { value: undefined } };
    }
    return {};
  };

  await typedLocator.fill("secret-password");
  assert.equal(filledFunctions.length, 1);
  assert.equal(filledFunctions[0].objectId, "element-1");
  assert.doesNotMatch(
    filledFunctions[0].functionDeclaration,
    /secret-password/,
  );
  assert.deepEqual(filledFunctions[0].arguments, [
    { objectId: "element-1" },
    { value: "secret-password" },
  ]);

  let fakeDocument;
  const button = {
    id: "button",
    ownerDocument: null,
    querySelectorAll: () => [],
    textContent: "Submit",
  };
  const container = {
    id: "container",
    ownerDocument: null,
    querySelectorAll: () => [button],
    textContent: "Submit Cancel",
  };
  const shell = {
    id: "shell",
    ownerDocument: null,
    querySelectorAll: () => [container, button],
    textContent: "Account Submit Cancel Footer",
  };
  fakeDocument = {
    querySelectorAll: (selector) => {
      assert.equal(selector, "*");
      return [shell, container, button];
    },
  };
  for (const element of [button, container, shell]) {
    element.ownerDocument = fakeDocument;
  }
  const evaluateWithFakeDocument = (expression) => {
    const hadDocument = Object.hasOwn(globalThis, "document");
    const previousDocument = globalThis.document;
    globalThis.document = fakeDocument;
    try {
      return Function(`return (${expression})`)();
    } finally {
      if (hadDocument) {
        globalThis.document = previousDocument;
      } else {
        delete globalThis.document;
      }
    }
  };
  const textLocatorObjects = [];
  const textPage = createCdpTestPage(
    "page-text",
    async (method, params = {}) => {
      if (method === "Runtime.evaluate") {
        const value = evaluateWithFakeDocument(String(params.expression));
        if (value && typeof value === "object") {
          textLocatorObjects.push(value.id);
          return { result: { objectId: value.id } };
        }
        return { result: { value } };
      }
      if (method === "DOM.describeNode") {
        return { node: { backendNodeId: 789 } };
      }
      if (method === "Runtime.callFunctionOn") {
        assert.equal(params.objectId, "button");
        return { result: { value: { x: 10, y: 20 } } };
      }
      return {};
    },
  );
  const textLocator = textPage.getByText("Submit");

  assert.equal(await textLocator.count(), 3);
  await textLocator.first().click();
  assert.deepEqual(textLocatorObjects, ["button"]);

  const clickedFunctions = [];
  const clickedPage = createCdpTestPage(
    "page-3",
    async (method, params = {}) => {
      if (method === "Runtime.evaluate") {
        return { result: { objectId: "button-1" } };
      }
      if (method === "DOM.describeNode") {
        return { node: { backendNodeId: 456 } };
      }
      if (method === "Runtime.callFunctionOn") {
        clickedFunctions.push(params);
        return { result: { value: undefined } };
      }
      return {};
    },
  );
  const clickedLocator = new CdpLocator(clickedPage, [
    { kind: "css", value: "#submit", index: 0 },
  ]);

  await clickedLocator.click();
  assert.equal(clickedFunctions.length, 1);
  assert.equal(clickedFunctions[0].objectId, "button-1");
  assert.equal(
    clickedFunctions[0].functionDeclaration,
    "(el) => el.click()",
  );
  assert.deepEqual(clickedFunctions[0].arguments, [
    { objectId: "button-1" },
  ]);
  assert.equal(clickedFunctions[0].userGesture, true);

  const uploadedFiles = [];
  const uploadPage = createCdpTestPage(
    "page-upload",
    async (method, params = {}) => {
      if (method === "Runtime.evaluate") {
        return { result: { objectId: "file-input-1" } };
      }
      if (method === "DOM.describeNode") {
        return { node: { backendNodeId: 987 } };
      }
      if (method === "DOM.setFileInputFiles") {
        uploadedFiles.push(params);
        return {};
      }
      return {};
    },
  );
  const uploadLocator = new CdpLocator(uploadPage, [
    { kind: "css", value: "input[type=file]", index: 0 },
  ]);
  const uploadFile = path.join(tmp, "photo.jpg");

  await uploadLocator.sendFile(uploadFile);
  assert.deepEqual(uploadedFiles, [{
    backendNodeId: 987,
    files: [uploadFile],
    objectId: "file-input-1",
  }]);
}
