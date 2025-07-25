import { Page } from 'rebrowser-playwright'

import { Workers } from '../Workers'


export class Quiz extends Workers {

    async doQuiz(page: Page) {
        this.bot.log(this.bot.isMobile, 'QUIZ', 'Trying to complete quiz')

        try {
            // Check if the quiz has been started or not
            const quizNotStarted = await page.waitForSelector('#rqStartQuiz', { state: 'visible', timeout: 2000 }).then(() => true).catch(() => false)
            if (quizNotStarted) {
                await page.click('#rqStartQuiz')
            } else {
                this.bot.log(this.bot.isMobile, 'QUIZ', 'Quiz has already been started, trying to finish it')
            }

            await this.bot.utils.wait(1000)

            // Solving
            const quizData = await this.bot.browser.func.getQuizData(page)
            const questionsRemaining = quizData.maxQuestions - (quizData.currentQuestionNumber - 1) // Amount of questions remaining

            for (let question = 0; question < questionsRemaining; question++) {
                // Since there's no solving logic yet, randomly guess to complete
                const buttonId = `#rqAnswerOption${Math.floor(this.bot.utils.randomNumber(0, 1))}`
                await page.click(buttonId)

                        const refreshSuccess = await this.bot.browser.func.waitForQuizRefresh(page)
                        if (!refreshSuccess) {
                            await page.close()
                            this.bot.log(this.bot.isMobile, 'QUIZ', 'An error occurred, refresh was unsuccessful', 'error')
                            return
                }
            }

            // Done with
            await this.bot.utils.wait(1000)
            await page.close()

            this.bot.log(this.bot.isMobile, 'QUIZ', 'Completed the quiz successfully')
        } catch (error) {
            await page.close()
            this.bot.log(this.bot.isMobile, 'QUIZ', 'An error occurred:' + error, 'error')
        }
    }

}