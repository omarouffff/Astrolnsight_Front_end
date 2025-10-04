from flask import Flask, request
from flask_cors import CORS

import test_query
app = Flask(__name__)
CORS(app)

@app.route('/ask', methods=['GET'])
def get_question_response():
    question = request.args.get('question')  # هنا ناخدها من query string
    print(question)
    return test_query.get_question_answer(question)


@app.route('/ask-test', methods=['GET'])
def get_question_response_test():
    citations_names_with_year = []

    citations = [
        {
            "title": "Mice in Bion-M 1 Space Mission: Training and Selection",
            "url": "https://google.com",
            "year": 2014
        }
    ]
    for c in citations:
        citations_names_with_year.append({
            "title": c.get("title", ""),
            "year": c.get("year", "")
        })

    return {
        "answer": "The purpose of the Bion-M 1 mission was to elucidate cellular and molecular mechanisms, underlying the adaptation of key physiological systems to long-term exposure in microgravity. "
                  "The scientific program of the Bion-M 1 project was aimed at obtaining data on mechanisms of adaptation of muscle, bone, cardiovascular, sensorimotor and nervous systems to prolonged exposure in microgravity and during post-flight recovery."
                  " After the flight, mice were in good condition for biomedical studies and displayed signs of pronounced disadaptation to Earth's gravity. "
                  "Examination of mice after the Bion-M 1 flight directly at the landing site (return +3 h) revealed gross motor function impairment: "
                  "the mice could not maintain steady posture.",

        "citations": citations,

        "citationsNamesWithYear": citations_names_with_year
    }


app.run(debug=True)