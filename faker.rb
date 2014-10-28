require 'faker'

random = Random.rand(0...10)

case random
    when 0
        p Faker::Hacker.say_something_smart
    when 1
        p Faker::Company.catch_phrase
    when 2
        p Faker::Company.bs
    when 3
        p Faker::Commerce.product_name
    when 4
        p Faker::Name.name
    when 5
        p Faker::Hacker.noun
    when 6
        p Faker::Hacker.adjective
    when 7
        p Faker::Hacker.verb
    when 8
        p Faker::Lorem.word
    when 9
        p Faker::Address.country
end


# p Faker::Hacker.say_something_smart
