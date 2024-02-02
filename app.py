from flask import Flask, render_template, request, redirect
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, UTC

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///demo.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)


class Demo(db.Model):
    serial = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    desc = db.Column(db.String(500), nullable=False)
    date_created = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f'{self.Serial}-{self.title}'


with app.app_context():
    db.create_all()


@app.route('/', methods=['GET', 'POST'])
def hello_world():
    if request.method == "POST":
        title = request.form['title']
        desc = request.form['desc']
        demo = Demo(title=title, desc=desc, date_created=datetime.now())
        db.session.add(demo)
        db.session.commit()
    all_demo = Demo.query.all()
    return render_template('index.html', all_demo=all_demo)
    # return 'Hello, World!'


@app.route('/show')
def products():
    all_demo = Demo.query.all()
    print(all_demo)
    return 'this is the products'


@app.route('/delete/<int:serial>')
def delete(serial):
    all_demo = Demo.query.filter_by(serial=serial).first()
    db.session.delete(all_demo)
    db.session.commit()
    return redirect('/')


@app.route('/update/<int:serial>', methods=['GET', 'POST'])
def update(serial):
    if request.method == 'POST':
        title = request.form['title']
        desc = request.form['desc']
        todo = Demo.query.filter_by(serial=serial).first()
        todo.title = title
        todo.desc = desc
        db.session.add(todo)
        db.session.commit()
        return redirect('/')

    todo = Demo.query.filter_by(serial=serial).first()
    return render_template('update.html', todo=todo)


if __name__ == '__main__':
    app.run(debug=True)
