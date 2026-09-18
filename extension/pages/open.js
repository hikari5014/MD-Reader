// 開啟檔案頁:選檔 → 存進文件庫 → 換成閱讀頁
// (瀏覽器不會告訴網頁檔案放在哪個資料夾,所以選檔開的文件看不到相對路徑的圖片;拖進分頁則可以)
MDR.loadSettings().then((s) => MDR.applySettings(document, s));

document.getElementById('file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return; // 取消選檔:留在這頁
  const doc = await MDR.saveDoc(file.name, await file.text());
  location.replace(MDR.viewerUrl({ doc }));
});
