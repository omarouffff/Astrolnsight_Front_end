const apiUrl = "http://127.0.0.1:5000/ask-test";

function loadData(question) {
  const url = `${apiUrl}?question=${encodeURIComponent(question)}`;
  fetch(url)
    .then(response => response.json())
    .then(data => {
      console.log("API response:", data);
    })
    .catch(error => {
      console.error("Error fetching data:", error);
    });
}


