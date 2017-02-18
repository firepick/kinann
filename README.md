## Whatizit?
**Kinann** is a Javascript library for building, training and using 
artificial neural networks for kinematic error modeling.

### Overview
Kinematic models for robots rarely match their implementations--axes may
be slightly misallgned, part dimensions may differ from nominal, etc.
To handle real world conditions, kinematic models are often extended 
to include error parameters. Unfortunately, the resulting kinematic models
are often cumbersome and unwieldy to work with.

Kinann lets you create an artificial neural network (ANN) that bridges
the gap between a simple, ideal kinematic model and any given implementation
of that kinematic model. Kinann will handle all the error corrections
automatically after proper calibration and training. Kinaan doesn't actually
need to know the precise kinematics of your model--all it does is model
the mismatch between ideal and actual coordinates. As long as your robot
is precise, Kinann will make sure that your robot moves accurately to
application coordinates:

   `IdealKinematics` + `Kinann` = `CalibratedRobot`

Kinann kinematic error regression ANNs can be linear or even polynomial.
Linear Kinann networks are often sufficient for Cartesian kinematics. However,
you will need polynomial Kinann networks to deal with non-linear kinematics.
For example, rotary delta kinematic errors often manifest as "bowl-shaped Z-plane errors".

Kinann builds kinematic neural networks for Javascript robot applications. 
There are many neural network frameworks 
(e.g., [synaptic.js](http://caza.la/synaptic/#/), 
[Tensorflow](https://www.tensorflow.org/), etc.) that can be used to solve
the kinematic error challenge. Kinann is optimized for kinematic modeling and
should not be used to...recognize cat pictures on YouTube.

### Installation
Use `npm` to install kinann.

`npm install kinann`

